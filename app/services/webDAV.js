const http = require('../utils/http')
const { sendFile , sendHTTPFile} = require('../utils/sendfile')

const slashify = (p) => (p[p.length-1] != '/' ? `${p}/` : p)

const propsCreate = (data , props) => {

  let out = ''
  for(let key in props){
    if(key == 'getlastmodified'){
      out += `<D:${key}>${data.updated_at}</D:${key}>`
    }
    if(key == 'displayname'){
      out += `<D:${key}>${data.name}</D:${key}>`
    }
    if(key == 'getcontentlength'){
      out += `<D:${key}>${parseInt(data.size || 0)}</D:${key}>`
    }
    if(key == 'resourcetype'){
      out += `<D:${key}>${data.type == 'folder' ? '<D:collection/>' : ''}</D:${key}>`
    }
    if(key == 'getcontenttype' && data.type != 'folder'){
      out += `<D:${key}>${data.mime}</D:${key}>`
    }
    if(key == 'creationdate'){
      out += `<D:${key}>${data.created_at}</D:${key}>`
    }
  }

  return out
}

const propsParse = (data) => {
  let props = data['D:propfind']['D:prop'][0]
  let ret = {}
  for(let prop in props){
    ret[prop.split(':')[1]] = props[prop][0]
  }
  // console.log('req:',ret)
  return ret
}

const respCreate = (data , options) => {
  let { props , path } = options
  let body = `<?xml version="1.0" encoding="utf-8"?>`
      body +=`<D:multistatus xmlns:D="DAV:">`
 
  data.forEach( file => {
    let href = path + file.href //path +'/' + encodeURIComponent(file.name)
    let res = propsCreate(file , props)
    body += `
      <D:response>
        <D:href>${href}</D:href>
        <D:propstat>
          <D:status>HTTP/1.1 200 OK</D:status>
          <D:prop xmlns:R="http://ns.example.com/boxschema/">${res}</D:prop>
        </D:propstat>
      </D:response>`
  })

  body +=`</D:multistatus>`
  // console.log(body)
  return body
}

class WebDAV {
  constructor(ctx){
    this.path = null
    this.ctx = ctx
    this.davPoweredBy = null
    this.httpAuthRealm = "ShareList WebDAV"

    this.allows = ['GET','PUT','HEAD','OPTIONS','PROPFIND']

  }

  _get_auth(){
    let authorization = this.ctx.get('authorization')
    let [ , value] = authorization.split(' ');
    let pairs = Buffer.from(value, "base64").toString("utf8").split(':')
    return pairs
  }

  _check_auth() {
    const ctx = this.ctx
    let auth_type = ctx.get("AUTH_TYPE") || null
    
    if( auth_type ){
      let [auth_user , auth_pw ] = this._get_auth()

      return true
    }else{
      return false
    }
    
  }

  async serveRequest(ctx , next , data){
    this.ctx = ctx
    this.data = data

    this.path = this.ctx.protocol + '://' + this.ctx.host //+ this.ctx.path

    this.setHeader("X-Dav-Powered-By" , this.davPoweredBy || 'ShareList')
    
    let method  = this.ctx.method.toLowerCase()

    /*
    if ( !(method == 'options' && this.ctx.path == "/") 
         && (this._check_auth())) {
        // RFC2518 says we must use Digest instead of Basic
        // but Microsoft Clients do not support Digest
        // and we don't support NTLM and Kerberos
        // so we are stuck with Basic here
        this.setHeader(`WWW-Authenticate: Basic realm="${this.httpAuthRealm}"`)

        // Windows seems to require this being the last header sent
        // (changed according to PECL bug #3138)
        this.setStatus('401 Unauthorized')

        return
    }*/
  
    

    const wrapperFn = "http_"+method;
    
    if (
      this[wrapperFn] 
    ) {
      await this[wrapperFn]()
    } 
    else {
      this.setStatus("405 Method not allowed")
      this.setHeader("Allow", this.allows.join(', '))
    }
  }


  checkAuth(type, username, password){ }

  setHeader(k , v){
    this.ctx.set(k , v)
  }

  setBody(body){
    this.ctx.type = 'text/xml; charset="utf-8"'
    this.ctx.body = body
  }

  setStatus(status) {
    if (status === true) {
      status = "200 OK"
    }
    let statusCode = status.split(' ')[0]
    this.ctx.status = parseInt(statusCode)
    this.setHeader('X-WebDAV-Status',status)
  }

  async http_options(){
    // For Microsoft clients
    this.setHeader("MS-Author-Via: DAV")

    const allows = this.allows

    let dav = [1]

    if (allow.includes('LOCK')) {
      dav.push(2)
    }

    this.setStatus("200 OK");
    this.setHeader("DAV: " + dav.join(', '))
    this.setHeader("Allow: " + allows.join(', '))
    this.setHeader("Content-length: 0");
  }

  /**
   * PROPFIND method
   *
   * @param  void
   * @return void
   */
  async http_propfind() {
    const { ctx  , data } = this

    let options = {
      path : this.path
    }

    // search depth (default is "infinity)
    //
    if (ctx.get('HTTP_DEPTH')) {
      options["depth"] = ctx.get('HTTP_DEPTH')
    } else {
      options["depth"] = "infinity"
    }       

    let props = propsParse( ctx.webdav )
    
    options['props'] = props


    const files = this.data.children

    if (files.length == 0) {
      this.setStatus("404 Not Found")
    }else{
      this.setStatus("207 Multi-Status")
      this.setBody(  respCreate(files , options) )
    }

  }


  /**
   * GET method
   *
   * @param  void
   * @return void
   */
  async http_get() {
    let data = this.data
    let url = data.url
    if(data.outputType === 'file'){
      sendFile(this.ctx, url)
    }
    else{
      await sendHTTPFile(this.ctx , url , data.headers || {})
    }
  }

  /*
  http_head() {}

  http_copy() {}

  http_move() {}

  http_mkcol() {}

  http_delete() {}

  http_proppatch() {}

  http_post() {}

  http_put() {}
  */
}

module.exports = new WebDAV()
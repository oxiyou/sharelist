/*
 * https
 */

const name = 'HTTPSFile'

const version = '1.0'

const protocols = ['https']

const url = require("url")

module.exports = (format) => {

  const file = (id)=>{
    return {
      id,
      name:id.split('/').pop(),
      ext: id.split('.').pop(),
      url: `https:${id}`,
      protocol:'https'
    }
  }

  const folder = file

  return { name , version , protocols , folder , file , mountable : false }
}
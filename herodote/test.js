var jwt = require('jsonwebtoken');
const uuidv4 = require('uuid/v4');

let token = jwt.sign(
              {
                  owner: 'me',
              },
              'example',
              {
                  jwtid: uuidv4()
              }
          )

let decoded = jwt.decode(token);

console.log("token", token);
console.log('##', decoded);


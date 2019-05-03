var CONFIG = require('config');
var Promise = require('promise');

var winston = require('winston');
const logger = winston.loggers.get('herodote');

var monk = require('monk');
var db = monk(CONFIG.mongo.host + ':' + parseInt(CONFIG.mongo.port) + '/' + CONFIG.mongo.db);
var users_db = db.get('users');

module.exports = {
    auth: (login, password) => {
        return new Promise(function (resolve, reject){
            user = {
                'uid': login,
                'mail': login,
                'uidNumber': 1000,
                'gidNumber': 1000,
                'external': true
            };
            users_db.update(
              {'uid': user.uid},
              {'$set': {
                  mail: user.mail,
                  uidNumber: user.uidNumber,
                  gidNumber: user.gidNumber,
                  external: user.external
                  },
              },
              {upsert: true}
            ).then( res => {
              resolve(user);
            })
        }); 
    }
}
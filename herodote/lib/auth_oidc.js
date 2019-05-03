var CONFIG = require('config');
var Promise = require('promise');
const axios = require('axios');
var winston = require('winston');
const logger = winston.loggers.get('herodote');
//var session = require('express-session');
var crypto = require("crypto");
var monk = require('monk');
var db = monk(CONFIG.mongo.host + ':' + parseInt(CONFIG.mongo.port) + '/' + CONFIG.mongo.db);
var users_db = db.get('users');
var oidc_db = db.get('oidc');

const { Issuer } = require('openid-client');
var metaOIDC = null;
var client = null;

function oidcDiscover(){
    return new Promise(function(resolve, reject){
        Issuer.discover(CONFIG.oidc.issuer)
        .then(oidcIssuer => {
            let metaOIDC = oidcIssuer.metadata;
            let issuer = oidcIssuer.issuer;
            oidcIssuer = new Issuer({
                issuer: issuer,
                authorization_endpoint: metaOIDC.authorization_endpoint,
                token_endpoint: metaOIDC.token_endpoint,
                userinfo_endpoint: metaOIDC.userinfo_endpoint,
                jwks_uri: metaOIDC.jwks_uri,
            });
            
            client = new oidcIssuer.Client({
                client_id: CONFIG.oidc.client_id,
                client_secret: CONFIG.oidc.client_secret
            });
            resolve(metaOIDC);
        }).catch(err => {
            reject("failed to discover oidc");
        });
    });
}

if(CONFIG.oidc.issuer) {
    oidcDiscover().then(meta => { metaOIDC = meta; }).catch(err => { console.log(err)});
}


module.exports = {

    discover: () => {
        return oidcDiscover();
    },
    auth: () => {
        return new Promise(function (resolve, reject){
           let state = crypto.randomBytes(20).toString('hex');
           let response_type = CONFIG.oidc.response_type;
           let ts = new Date().getTime();
           oidc_db.insert({'state': state, 'response_type': response_type, 'created': ts}).then(s => {
                let authUrl = client.authorizationUrl({
                    redirect_uri: CONFIG.herodote.public_href + CONFIG.oidc.callbackURL,
                    scope: CONFIG.oidc.scope,
                    state: state,
                    response_type: response_type
                });
                resolve(authUrl);
            })

        }); 
    },
    callback: (request) => {
        return new Promise(function (resolve, reject){
            
            oidc_db.findOne({'state': request.query.state}).then(s => {
                if(!s) { reject('not found'); return;}
                oidc_db.remove({'_id': s._id}).then(del => {
                    // let response_type = s.response_type
                    // let state= s.state
                    // let checks = { state }
                    const encoded = CONFIG.oidc.client_id + ':' + CONFIG.oidc.client_secret;
                    const value = Buffer.from(encoded).toString('base64');
                    let headers = {
                        Authorization: 'Basic ' + value,
                        'Content-Type': 'application/x-www-form-urlencoded'
                    };
                    axios.post(metaOIDC.token_endpoint,
                    'grant_type=authorization_code&code=' + request.query.code + '&redirect_uri='+CONFIG.herodote.public_href + CONFIG.oidc.callbackURL
                    ,
                    {
                        headers: headers
                    }).then(resp => {
                        let access_token = resp.data.access_token;
                        // console.log('access token', access_token);
                        axios.get(metaOIDC.userinfo_endpoint, {
                            headers: {
                                Authorization: 'Bearer ' + access_token
                            }
                        }).then(userinfo => {
                            resolve(userinfo.data);
                        }).catch(
                            err => {
                                reject(err);
                            }
                        );
                    }).catch(
                        err => {
                            reject(err);
                        }
                    );

                });
            }).catch(err => reject(err));
            
        });
    }
}
var CONFIG = require('config');
var Promise = require('promise');
const axios = require('axios')
var winston = require('winston');
var jwt = require('jsonwebtoken');
const logger = winston.loggers.get('herodote');

var monk = require('monk');
var db = monk(CONFIG.mongo.host + ':' + parseInt(CONFIG.mongo.port) + '/' + CONFIG.mongo.db);
var jobs_db = db.get('jobs');
var users_db = db.get('users');

/*
job = {
            id: bucket+'.'+ts,
            user: project.owner,
            hook: hook,
            projectId: project._id,
            file: filePath,
            start: ts,
            begin: 0,
            end: 0,
            status: CREATED,
            code: -1
        }
*/
function runJob(url, secret, job) {
    return new Promise(function(resolve, reject){
        let token = jwt.sign(
            {
                job: {
                    id: job.id,
                    file: job.file,
                    project: job.projectId
                }
            },
            secret
        );
        let headers = {
            Authorization: 'Bearer ' + token,
            'Content-Type': 'application/json'
        };
        axios.post(url,
            {
                cmd: job.hook.script,
                file: job.file,
                hook: job.hook.name
            }
            ,
            {
                headers: headers
            }
        )
        .then(resp => {
            resolve(true);
        })
        .catch(err => {
            logger.error("Failed to contact url: " + url + ", " + err.errno);
            resolve(true);
        });

    })
}

module.exports = {
    run: (job) => {
        return new Promise(function(resolve, reject){
            if(job.hook.extra===undefined) {
                reject('no extra parameter');
            }
            let url = null;
            let secret = null;
            for(let i=0;i<job.hook.extra.length;i++){
                let extra = job.hook.extra[i];
                if(extra.startsWith('url=')){
                    url = extra.replace('url=', '');
                } else if(extra.startsWith('secret=')) {
                    secret = extra.replace('secret=', '');
                }
            }
            if(url == null || secret == null) {
                reject('url or secret not provided');
                return;
            }
            runJob(url, secret, job).then(res => {
                resolve(true);
            }).catch(err => {
                logger.error('failed to call web hook', err);
            })
        });
    }
}

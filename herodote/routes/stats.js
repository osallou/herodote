var express = require('express');
var router = express.Router();
var winston = require('winston');
var CONFIG = require('config');

var monk = require('monk');
var db = monk(CONFIG.mongo.host + ':' + parseInt(CONFIG.mongo.port) + '/' + CONFIG.mongo.db);
var jobs_db = db.get('jobs');
//var projects_db = db.get('projects');

const logger = winston.loggers.get('herodote');

router.get('/jobs/:projectId', function(req, res){
    if(! req.locals.logInfo.is_logged) {
        res.status(401).send('Not authorized');
        return;
    }
    jobs_db.find({
        'projectId': monk.id(req.params.projectId),
        'user': req.locals.logInfo.session_user.uid
    }).then(joblist => {
        let jobs = {};
        let pending = 0;
        let running = 0;
        let done = 0;
        for(let i=0;i<joblist.length;i++) {
            let job = joblist[i];
            if(job.status == 0) {
                pending++;
            } else if (job.status == 1) {
                running++;
            } else {
                done++;
            }
        }
        res.send({'pending': pending, 'running': running, 'done': done});
        res.end();
    })
  })
  
  module.exports = router;
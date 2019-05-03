var express = require('express');
var router = express.Router();
var winston = require('winston');
var CONFIG = require('config');


const logger = winston.loggers.get('herodote');

var keystone = require('../lib/keystone');


router.get('/keystone', function(req, res){
  if(! req.locals.logInfo.is_logged) {
      res.status(401).send('Not authorized');
      return;
  }
  keystone.isToken(req).then((token) => {
    keystone.listProjects(token, req.locals.logInfo.session_user.ksUserId).then(projects => {
        let userProject = []
        for(let i=0;i<projects.length;i++) {
          let p = projects[i];
          if(p.name == req.locals.logInfo.session_user.ksProjectName) {
            userProject.push({'name': p.name, 'id': p.id});
            break;
          }
        }
        res.send({'ksProjects': userProject});

    }).catch(err => {
      res.status(401).send(err);
    })
  })
})

module.exports = router;

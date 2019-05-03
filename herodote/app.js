var createError = require('http-errors');
var express = require('express');
var path = require('path');
var cookieParser = require('cookie-parser');
var morgan = require('morgan');
var winston = require('winston');
var jwt = require('jsonwebtoken');
const Prometheus = require('prom-client');

const projectsGauge = new Prometheus.Gauge({
    name: 'herodote_projects',
    help: 'number of projects',
    labelNames: ['type']
  })

const usersGauge = new Prometheus.Gauge({
    name: 'herodote_users',
    help: 'number of users',
    labelNames: ['type']
  })

const jobsGauge = new Prometheus.Gauge({
    name: 'herodote_jobs',
    help: 'number of jobs',
    labelNames: ['type']
  })

var loggerOptions = {
  level: 'info',
  format: winston.format.json(),
  defaultMeta: {service: 'herodote'},
  transports: [
    //
    // - Write to all logs with level `info` and below to `combined.log` 
    // - Write all logs error (and below) to `error.log`.
    //

    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' })
  ]
}

if (process.env.NODE_ENV === 'development') {
  loggerOptions.transports.push(new winston.transports.Console({
    format: winston.format.simple(),
    level: 'debug'
  }));
}

winston.loggers.add('herodote', loggerOptions);

var logger = winston.loggers.get('herodote');

logger.stream = {
  write: function(message, encoding) {
    logger.info(message);
  },
};

var CONFIG = require('config');

var monk = require('monk');
var db = monk(CONFIG.mongo.host + ':' + parseInt(CONFIG.mongo.port) + '/' + CONFIG.mongo.db);
var users_db = db.get('users');
var projects_db = db.get('projects');
var jobs_db = db.get('jobs');

var homeRouter = require('./routes/home');
var configRouter = require('./routes/config');
var usersRouter = require('./routes/users');
var authRouter = require('./routes/auth');
var projectsRouter = require('./routes/projects');
var jobsRouter = require('./routes/jobs');
var statsRouter = require('./routes/stats');

var cors = require('cors');
var app = express();

// view engine setup
app.set('views', path.join(__dirname, 'views'));
app.set('view engine', 'pug');

app.use(morgan('combined', { stream: logger.stream }));
app.use(cors({exposedHeaders: ['X-HERODOTE-JOBS']}));
app.set('port', process.env.PORT || 3000);
app.use(express.json());
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));


app.all('*', function(req, res, next){
  let logInfo = {
      is_logged: false,
      session_user: null,
      ksToken: null
  };
  if(! req.locals) {
      req.locals = {};
  }

  logInfo.ksToken = req.headers['x-ks-token'] || null;
  let token = req.headers['x-api-key'] || null;
  let bindAs = req.headers['x-herodote-bind'] || null;
  let jwtToken = null;
  let authorization = req.headers['authorization'] || null;
  if (authorization) {
      let elts = authorization.split(' ');
      try {
          jwtToken = jwt.verify(elts[elts.length - 1], CONFIG.secrets.jwt);
      } catch(err) {
          logger.warn('failed to decode jwt');
          jwtToken = null;
      }
  }
  if(jwtToken){
      try{
          if (jwtToken.user && jwtToken.user.uid && bindAs) {
            let admins = CONFIG.herodote.admin.split(',');
            if(admins.indexOf(jwtToken.user.uid) >= 0) {
                logger.debug('admin bind request', jwtToken.user.uid, bindAs);
                jwtToken.user.uid = bindAs;
            } else {
                return res.status(403).send('Operation not permitted, not allowed to bind to an other user.').end();
            }
          }
          if(jwtToken.isLogged) {
              logInfo.is_logged = true;
          }
          if(jwtToken.user && jwtToken.user.uid) {
              users_db.findOne({'uid': jwtToken.user.uid}, function(err, session_user){
                  if(err){
                      return res.status(401).send('Invalid token').end();
                  }
                  logInfo.session_user = session_user;
                  if (jwtToken.user.ksUserId) {
                    logInfo.session_user.ksUserId = jwtToken.user.ksUserId; 
                  }
                  if (jwtToken.user.ksProjectName) {
                    logInfo.session_user.ksProjectName = jwtToken.user.ksProjectName;
                  }
                  req.locals.logInfo = logInfo;
                  next();
              });
          } else {
              req.locals.logInfo = logInfo;
              next();
          }
      }
      catch(error){
          logger.warn('Invalid token', error);
          return res.status(401).send('Invalid token').end();
      }
  }
  else if(token){
      try{
          users_db.findOne({'apikey': token}, function(err, session_user){
              if(err){
                  return res.status(401).send('Invalid token').end();
              }
              logInfo.is_logged = true;
              logInfo.session_user = session_user;
              req.locals.logInfo = logInfo;
              next();
          });
      }
      catch(error){
          logger.warn('Invalid api key', error);
          return res.status(401).send('Invalid api key').end();
      }
  }else{
    logger.debug('anonymous access');
    req.locals.logInfo = logInfo;
    next();
  }
});

if(process.env.NODE_ENV === 'development') {
  app.use('/ui', express.static(path.join(__dirname, 'ui/herodote-ui/src/')));
} else {
  app.use('/ui', express.static(path.join(__dirname, 'ui/herodote-ui/dist/herodote-ui/')));
}

//app.use('/', indexRouter);
app.get('/metrics', (req, res) => {
  users_db.count({}).then(cusers => {
    usersGauge.set(cusers);
    return projects_db.count({})
  }).then(cprojects => {
      projectsGauge.set(cprojects);
      return jobs_db.count({})
  }).then(cjobs => {
      jobsGauge.set(cjobs);
      res.set('Content-Type', Prometheus.register.contentType)
      res.end(Prometheus.register.metrics())
  }).catch(err => {
      logger.error('metrics failure: ' + err);
      res.set('Content-Type', Prometheus.register.contentType)
      res.end(Prometheus.register.metrics())      
  })
})
app.use('/', homeRouter);
app.use('/config', configRouter);
app.use('/users', usersRouter);
app.use('/auth', authRouter);
app.use('/projects', projectsRouter);
app.use('/jobs', jobsRouter);
app.use('/stats', statsRouter);

// catch 404 and forward to error handler
app.use(function(req, res, next) {
  next(createError(404));
});

// error handler
app.use(function(err, req, res, next) {
  // set locals, only providing error in development
  res.locals.message = err.message;
  res.locals.error = req.app.get('env') === 'development' ? err : {};

  // render the error page
  logger.error(`${err.status || 500} - ${err.message} - ${req.originalUrl} - ${req.method} - ${req.ip}`);
  res.status(err.status || 500);
  res.render('error');
});

module.exports = app;

from swift.common.swob import HTTPForbidden, HTTPUnauthorized, HTTPNotFound
import logging
import json
import jwt
from swift.common.utils import split_path
import requests
import urllib

class Authorization(object):

    def __init__(self, app, conf):
        self.app = app
        self.conf = conf

    def __call__(self, environ, start_response):
        token = environ.get('HTTP_X_AUTH_TOKEN', environ.get('HTTP_X_STORAGE_TOKEN'))
        creds = None
        try:
            creds = jwt.decode(token, self.conf.get('secret'))
        except Exception as e:
            logging.debug("decode error " + str(e))
        if creds is not None:
            creds['herodote_url'] = self.conf.get('herodote_url')
            if 'swift.authorize' not in environ:
              environ['swift.authorize'] = self.authorize(creds)
            environ['swift.authorize_override'] = True
            environ['REMOTE_USER'] = '.wsgi.herodote'

        def herodote_response(stat_str, headers=[]):
            resp = start_response(stat_str, headers)
            try:
                r = requests.post(
                    self.conf.get('herodote_url') + environ['PATH_INFO'].replace('v1', 'jobs/swift'),
                    json={
                    },
                    headers={
                        'X-SWIFT-TOKEN': str(self.conf.get('token'))
                    }
                )
                if r.status_code != 200:
                    logging.error('herodote authorization failed')
                    return start_response('403 Unauthorized', [])
            except Exception:
                logging.exception('failed to contact herodote')
                return start_response('500 Error', [])
            return resp
        obj = None
        try:
            (version, account, container, obj) = \
                split_path(environ['PATH_INFO'], 4, 4, True)
        except ValueError:
            # not an object request
            pass
        if environ['REQUEST_METHOD'] == 'PUT' and obj:
            return self.app(environ, herodote_response)

        return self.app(environ, start_response)

    def authorize(self, creds):
      def isTokenValid(req):
        try:
            version, account, container, obj = split_path(req.path, 1, 4, True)
        except ValueError:
            return HTTPNotFound(request=req)
        if 'prefix' in creds and creds['prefix']:
            if not obj.startswith(creds['prefix']):
                return HTTPUnauthorized(request=req)
        if req.method not in ('GET', 'HEAD'):
            if 'ro' in creds and creds['ro']:
                return HTTPUnauthorized(request=req)

        if account != creds['account']:
            return HTTPUnauthorized(request=req)
        else:
            uc = urllib.unquote(container)
            if uc!=creds['container'] and uc!=creds['container']+'_segments':
                return HTTPUnauthorized(request=req)
        try:
            payload = {}
            if 'jti' in creds:
                payload['jti'] = creds['jti']
            r = requests.get(creds['herodote_url'] + '/auth/swift/' + creds['owner'] + '/' + creds['container'] + '/' + creds['user'], params=payload)
            if r.status_code != 200:
                return HTTPUnauthorized(request=req)
            return None
        except Exception:
            return HTTPUnauthorized(request=req)

      return isTokenValid


def filter_factory(global_conf, **local_conf):
    conf = global_conf.copy()
    conf.update(local_conf)
    def auth_filter(app):
        return Authorization(app, conf)
    return auth_filter

const expect = require('chai').expect;
var CONFIG = require('config');
const nock = require('nock');
var keystone = require('../lib/keystone');

let chai = require('chai');
let chaiHttp = require('chai-http');
let should = chai.should();
let server = require('../app');
chai.use(chaiHttp);


//const requester = chai.request.agent(server);
//after(() => requester.app.close());

//const ks_url = CONFIG.openstack.keystone.url + '/auth/tokens';

describe('Test keystone mocking', () => {
    beforeEach(() => {
      nock(CONFIG.openstack.keystone.url)
        .post('/auth/tokens')
        .reply(200, {
                token: {
                    user: {
                        id: 'fake'
                    }
                }
        }, {'x-subject-token': '1234'});
    });
  
    it('fake user auth with fake auth', () => {
        process.env['FAKE_AUTH'] = '1'
      return keystone.bind('fake', 'fakepassword', 'fake', 'default', false)
        .then(response => {
          console.log(response);
          expect(response.ksToken).to.equal('1234');
          expect(response.ksUserId).to.equal('fake');
        });
    });
  });


describe('Test fake auth', () => {

    beforeEach(() => {
        nock(CONFIG.openstack.keystone.url)
          .post('/auth/tokens')
          .reply(200, {
                  token: {
                      user: {
                          id: 'fake'
                      }
                  }
          }, {'x-subject-token': '1234'});
      });

  it('it should succeed to auth', (done) => {
    process.env['FAKE_AUTH'] = '1'

    chai.request(server)
        .post('/auth')
        .end((err, res) => {
            res.should.have.status(200);
            expect(res.body.token).not.to.null
          done();
        });
  });
});


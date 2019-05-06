import { Injectable } from '@angular/core';
import { HttpClient, HttpInterceptor, HttpRequest, HttpHandler, HttpEvent } from '@angular/common/http';
import { Router } from '@angular/router';
import { environment } from '../../environments/environment';
import { Observable, Subscription } from 'rxjs';
import { Subject } from "rxjs";
import { tap} from 'rxjs/operators';


@Injectable({
  providedIn: 'root'
})
export class AuthService {

  public $authStatus =new Subject<boolean>();

  accessToken: string;
  ksToken: string;
  authenticated: boolean;
  userProfile:  any;

  constructor(private http: HttpClient, private router: Router) {
  }

  login(login, password, project) {
    return new Promise((resolve, reject) => {
      this.http.post(
        environment.apiUrl + '/auth',
        { login: login, password: password, project: project },
        { observe: 'response' }).subscribe(
          resp => {
            if(! resp.body['user']) {
              reject({'error': resp.body['msg']});
              return;
            }
            this.userProfile = resp.body['user'];
            this.authenticated = true;
            this.$authStatus.next(true);
            resolve(resp.body['user']);
          },
          err => {
            reject(err);
          }
        )
      });
  }

  logout() {
    this.accessToken = null;
    this.userProfile = null;
    this.authenticated = false;
    this.$authStatus.next(false);
    localStorage.removeItem('herodoteToken');
    localStorage.removeItem('ksToken');
  }


  autoLog() {
    this.http.get(environment.apiUrl + '/auth/autobind').subscribe(
      resp =>{
        if(resp['user']) {
          this.userProfile = resp['user'];
          this.authenticated = true;
          this.$authStatus.next(true);
        }
      },
      err => {console.log('Error', err);}
    )
  }

  get profile(): any {
    return this.userProfile
  }

  get isLoggedIn(): boolean {
   return this.authenticated
  }

}


@Injectable()
export class AuthInterceptor implements HttpInterceptor {

  constructor(private auth: AuthService, private router: Router) {}

  intercept(req: HttpRequest<any>, next: HttpHandler): Observable<HttpEvent<any>> {
      let authReq = req;
      if(! this.auth.accessToken && localStorage.getItem('herodoteToken')) {
        this.auth.accessToken = localStorage.getItem('herodoteToken');
      }
      if(! this.auth.ksToken && localStorage.getItem('ksToken')) {
        this.auth.ksToken = localStorage.getItem('ksToken');
      }
      if (! this.auth.ksToken) {
        this.auth.ksToken = ""
      }
      if(this.auth.accessToken) {
        authReq = req.clone({
          setHeaders: {
            Authorization: 'bearer ' + this.auth.accessToken,
            "x-ks-token": this.auth.ksToken
          }
        });
      }
      return next.handle(authReq).pipe(
        tap(event => {
          if(event['body'] && event['body']['token']) {
            this.auth.accessToken = event['body']['token'];
            localStorage.setItem('herodoteToken', event['body']['token']);
            
          }
          if(event['body'] && event['body']['keystoneToken']) {
            this.auth.ksToken = event['body']['keystoneToken'];
            localStorage.setItem('ksToken', event['body']['keystoneToken']);
            
          }
        }, error => {
          if(error.status == 401) {
            this.auth.logout();
            if(this.router.url !== '/faq') {
              this.router.navigate(['/login']);
            }
          }
        })
      );
      
  }
}
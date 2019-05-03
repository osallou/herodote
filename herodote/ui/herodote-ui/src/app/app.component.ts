import { Component } from '@angular/core';
import { Subscription } from 'rxjs';
import { AuthService } from './auth/auth.service';
import { Router, ActivatedRoute } from '@angular/router';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.css']
})
export class AppComponent {
  title = 'herodote-ui';
  user = null;
  isLogged: boolean = false;

  private loginSubscription: Subscription;

  ngOnInit() {
  }

  ngAfterViewInit() {
    this.loginSubscription = this.authService.$authStatus.subscribe((authenticated: boolean) => {
      setTimeout(() => {
      this.user = this.authService.userProfile;
      this.isLogged = authenticated;
      if(this.isLogged) {
        this.router.navigate(['/projects']);
      }
      })
    })
    setTimeout(() => {

      this.route.queryParams.subscribe(params => {
        // this.param1 = params['param1'];
        if (params['oidcToken']) {
          this.authService.accessToken = params['oidcToken'];
          localStorage.setItem('herodoteToken', params['oidcToken']);
          this.authService.autoLog();
        } else {
          this.authService.autoLog();
        }
      });
    }, 1000)
  }

  ngOnDestroy() {
    if (this.loginSubscription) {
      this.loginSubscription.unsubscribe();
    }
  }

  constructor(
    private authService: AuthService,
    private router: Router,
    private route: ActivatedRoute
  ) {
    this.user = {
      is_admin: false
    }
    
  }
}

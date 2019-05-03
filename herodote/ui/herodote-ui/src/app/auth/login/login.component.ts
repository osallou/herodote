import { Component, OnInit, NgZone } from '@angular/core';
import { AuthService } from '../auth.service';
import { Router } from '@angular/router';
import { environment } from '../../../environments/environment';
import { ConfigService } from 'src/app/config.service';

@Component({
  selector: 'app-login',
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css']
})
export class LoginComponent implements OnInit {

  oidcUrl: string

  constructor(
    private authService: AuthService,
    private router: Router,
    private configService: ConfigService
  ) {
    this.oidcUrl = environment.apiUrl + "/auth/oidc/login"
  }

  static SUCCESS: number = 0;
  static ERROR: number = 1;

  userId: string
  password: string
  project: string
  msg: string
  error_msg: string
  msgstatus: number
  oidc: boolean = true

  uid: string

  userData: any

  ngOnInit() {
    this.userId = '';
    this.configService.get().subscribe(
      resp => this.oidc = resp['config']['oidc'],
      err => console.log('failed to get config')
    )
  }


  login() {
    if(!this.userId) {
      this.error_msg = "login is missing";
      return
    }
    if(!this.password) {
      this.error_msg = "password is missing";
      return
    }
    if(!this.project) {
      this.error_msg = "project is missing";
      return
    }
    this.authService.login(this.userId,this.password, this.project).then(
      userData => {
          this.router.navigate(['project']);
      }
    ).catch( err => {this.msg = err.error;});
    this.password = "";
  }


}

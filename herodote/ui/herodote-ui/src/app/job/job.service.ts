import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';
import { HttpClient, HttpParams } from '@angular/common/http';


export class Project {
  name: string
  description: string
  ksProject: string
  ksToken: string
  hooks: any[] = []
  acls: any[] = []


  toJson() {
    return {
      name: this.name,
      description: this.description,
      ksProject: this.ksProject,
      ksToken: this.ksToken,
      hooks: this.hooks,
      acls: this.acls
    }
  }
}

@Injectable({
  providedIn: 'root'
})
export class JobService {

  constructor(private http: HttpClient) { }

  count(projectId) {
    return this.http.head(environment.apiUrl + '/jobs/' + projectId, {observe: 'response'});
  }

  list(projectId, page) {
    let params = new HttpParams().set('limit', '30').set('skip', (page * 30).toString());
    return this.http.get(environment.apiUrl + '/jobs/' + projectId, {params: params});
  }

}

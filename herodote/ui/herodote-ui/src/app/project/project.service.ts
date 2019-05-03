import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';
import { HttpClient } from '@angular/common/http';


export class Project {
  _id: string
  name: string
  description: string
  ksProject: string
  ksToken: string
  hooks: any[] = []
  acls: any[] = []
  web: boolean


  toJson() {
    return {
      _id: this._id,
      name: this.name,
      description: this.description,
      ksProject: this.ksProject,
      ksToken: this.ksToken,
      hooks: this.hooks,
      acls: this.acls,
      web: this.web
    }
  }
}

@Injectable({
  providedIn: 'root'
})
export class ProjectService {

  constructor(private http: HttpClient) { }

  jobStats(projectId) {
    return this.http.get(environment.apiUrl + '/stats/jobs/' + projectId);
  }

  listKs() {
    return this.http.get(environment.apiUrl + '/users/keystone');
  }

  list() {
    return this.http.get(environment.apiUrl + '/projects');
  }

  create(project: Project) {
    return this.http.post(environment.apiUrl + '/projects', project.toJson());
  }

  delete(project: Project) {
    return this.http.delete(environment.apiUrl + '/projects/' + project.ksProject + '/' + project.name);
  }

  get(projectName: string) {
    return this.http.get(environment.apiUrl + '/projects/' + projectName);
  }

  update(project: Project) {
    return this.http.put(environment.apiUrl + '/projects/' + project.name, project);
  }

  web(project: Project) {
    return this.http.put(environment.apiUrl + '/projects/' + project.name + '/web', project);
  }
}

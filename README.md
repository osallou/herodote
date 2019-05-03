# Herodote

Serverless data manager between openstack swift and some executors (slurm, webhooks, ...)

## About

Herodote manages access to an Openstack Swift storage (an object storage). It *hides* Swift and allows users to create projects (a swift bucket) and manage data access to other users with specific tokens.

Help with a swift middleware (see below if you install Herodote), when a file is uploaded (new or modified) to the storage, Herodote is triggered. If user defined for the related bucket a *hook*, then Herodote execute the defined script for the related file using an executor.

The executors supported by Herodote are:

* Slurm (via Go-Docker)
* Sge (via Go-Docker)
* Web hooks: call an external web application ([herodote-cli](https://github.com/osallou/herodote-cli) for example)

Hooks are basically bash scripts matching some files with a regular expression (see FAQ in web page for more info, by default matches all data pushed to /data/*).

Several *hooks* can be created for a same project. This means that several scripts will be executed for the same file (with a unique job identifier).

Once job is executed, result files are uploaded back to the storage system with the log of the execution. To do so, *hooks* provide helper macros to download/upload files on their storage project.

You can see *Herodote* as a serverless platform to automatically run some analysis on your data. Job is executed on job arrival and you get your results back in storage without having to care about it.

Data access (read-only or read-write) can be shared with other users, even if they do not have an account on *Herodote*. Each user gets a token that can be revoked at any time. Those users can download your data, or even (if allowed) upload some new data that will trigger new jobs.

## Data access

The storage being Openstack Swift, you can use any client compatible or use their API however we recommand to use the python swiftclient tool. Usage is detailled on each project page.

## Object storage

An object storage is not a POSIX compliant storage, this means you cannot read or write directly the files, you need to download or upload them (you can compare it to Dropbox, Google drive etc.)
There is also no *directory* hierarchy: a file can be uploaded with any path without creating first the parent directories.

One can for example upload to *data/dir1/dir2/file* directly.

## Authentication

Herodote connects to a LDAP system to authenticate users. It also supports OpenID Connect (if enabled, to disable see oidc.issuer to empty string).

OIDC has been tested with [Elixir AAI](https://www.elixir-europe.org/services/compute/aai) only.

## Config

see herodote/config and copy default.yml.template to default.yml

see herodote/config/custom-environment-variables.yaml to override config by environment variables

## Repository structure

* herodote: main server to handle web server, job submission etc.
* swift-auth-middleware: Openstack Swift middleware to handle authorizations and trigger *herodote* when a file is created/updated
* my-herodote: client tool to manage *herodote* projects via command-line (for end-user or administrators)

## Building

For backend

    npm install

To build ui in herodote/ui/herodote-ui

    npm install
    ng build --base-href /ui/

## Running

    cd herodote
    npm start

    #Need rabbitmq up
    # process that takes actions (job submit, clear bucket, ...)
    node jobReceiver.js

To run a process as a daemon:

    npm install -g forever
    forever start bin/herodote-server
    ...
    forever stop bin/herdote-server

## Auth and hook middleware

A Swift auth middleware is available in directory swift-auth-middleware/herodote-auth

It needs to be installed to allow access to buckets and to trigger herodote on new/updated file.

## Administrator tool

Local administrator can use the **herodote** client to get information on projects, users, update quotas, ...

    bin/herodote-admin -h

## User tool

Users (and admin) can use my-herodote npm package to query Herodote server.
Administrators have option --as to run command as a different user.

For users connecting via OpenID Connect, command-line tool cannot be used for the moment (in the roadmap).

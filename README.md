# Cloud Directory IDE
⚠ Early Access Alpha ⚠

## Overview
A __client-side__ IDE for working with AWS Cloud Directory in your browser. There is no backend other than your own AWS Cloud Directory.

## Setup
To get the UI working with your AWS Account deploy `role.yml` via CloudFormation. The parameters requested are so that you can easily log into a secure Role from your Browser.

## User Interface
There are two main editors, one for Schemas and another for the Directory. At the top of the editor you can see:
- `Namespace`: This is your Google User ID. It is used to name Directories and Schemas in your AWS Account.
- `State`: This is either DEVELOPMENT, PUBLISHED, or APPLIED
- `Version`: This is the current version of the Schema. Only applies to Published or Applied Schemas.

![Schema Editor](images/schema-editor.png)



## TODO / Wishlist
- Test adding objects
- Get typed link facets working
- Get graph working
- Schema diffing in editor

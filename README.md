# Package.js

JavaScript package manager and build tools designed for web app framework development in web browser environment.

## Installation:

You need install node.js and npm first;See http://nodejs.org/ and http://npmjs.org/ ;
```bash
  $ cd package-js
  $ sudo npm install -g
```

## Getting started:

* Put ```package-js/src/Package``` directory to your static js directory. For example:```your-project/statics/jslibs/Package```;
* Create your library,example:```XLib```;
* Create ```XLib/_nsconf_.js```;
* Create ```XLib/init.js```;
* Link ```XLib/_xproxy_.html``` to ```Package/_xproxy_.html``` if you want to load tpl.html or other assets cross domains;
* Create other packages;

For complete references,see ```docs/Package.html```;

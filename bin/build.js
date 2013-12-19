#!/usr/bin/env node
"use strict";

var util=require('util');
var fs=require('fs');
var path=require('path');
var PackageLibFile=fs.realpathSync(path.join(__dirname,'../src/Package/init.js'));
var Package=require(PackageLibFile).Package;
var extend=Package.extend;

var ie6PngFilterCode="DXImageTransform.Microsoft.AlphaImageLoader";

var ie6PngFilterRe=/DXImageTransform\.Microsoft\.AlphaImageLoader\s*\(.*src\s*=\s*(?:'|")([^'"]+)(?:'|").*\)/ig;

function extendIf(target,src) {
  for (var p in src) {
    if (target.hasOwnProperty(p)) continue;
    target[p]=src[p];
  }
}


Array.prototype.flatten=function () {
  return this.reduce(function (a,b) {
    if (util.isArray(b)) {
      b=b.flatten();
    }
    return a.concat(b);
  },[]);
};
Array.prototype.filterEmpty=function () {
  return this.filter(function (x) {return x});
};
if (require.main===module) {
  main.apply(null,process.argv.slice(2));
}

function main(configFile,op,outputFile) {
  if (arguments.length<3) {
    return console.info(getHelp());
  }
  op=String(op).toLowerCase();
  if (['js','css','css4ie6'].indexOf(op)<0) {
    return console.error('Operation type must be one of `js` or `css` or `css4ie6`!\nGiven:'+operation);
  }
  var baseDir=fs.realpathSync(path.dirname(configFile));
  var conf=fs.readFileSync(configFile,'utf-8');
  try {
    conf=new Function('return ('+conf+');')();
  } catch(e) {
    console.error('Config file syntax error:'+configFile);
    throw e;
  }
  //设置config一些默认值
  extendIf(conf,{
    imported:[],
    preloadScripts:[],
    preloadStyles:[],
    postloadScripts:[],
    postloadStyles:[],
    exportMode:"all"
  });
  //conf.preloadScripts,postloadScripts,preloadStyles,postloadStyles,nsconfs
  //使用的是相对于configFile的路径，将它们全部转换成绝对路径
  var props="preloadScripts,postloadScripts,preloadStyles,postloadStyles,nsconfs".split(",");
  var i,paths;
  for (i=0;i<props.length;i++) {
    paths=conf[props[i]];
    if (paths) {
      conf[props[i]]=paths.map(getAbsFile);
    }
  }

  buildPkgs(conf,op,outputFile);

  function getAbsFile(p) {
    return fs.realpathSync(path.join(baseDir,p));
  }
}

function getHelp() {
  var prog=path.basename(process.argv[1]);
  return "Usage:\n\t"+prog+" config.json type output\n"+
    "Example:\n\t"+prog+" config.json js all.js\n\t"+
    prog+" config.json css all.css\n\t"+
    prog+" config.json css4ie6 all4ie6.css";
}






/**
 * conf 配置对象
 * op  合并js或css,css4ie6
 * outputFile
 */
function buildPkgs(conf,op,outputFile) {
  var ie6=op=='css4ie6';
  Package._IE6=ie6;//这个值一定要在nsconf初始化好之前设置

  loadNSConfs(conf);
  var sortedPkgs=getBuildPkgs(conf.includes,conf.imported,conf.exportMode);
  if (conf.embedPackageCore===false && sortedPkgs[0]=="Package") {
    sortedPkgs.shift();
  }
  var metas=sortedPkgs.map(getPkgMeta);

  var data,preload,postload;
  if (op=='js') {
    data=buildJS(metas);
    preload=conf.preloadScripts;
    postload=conf.postloadScripts;
  } else if (op=='css' || op=='css4ie6'){
    preload=conf.preloadStyles;
    postload=conf.postloadStyles;
    data=buildCSS(metas);
  }

  if (preload) {
    data=preload.map(readFile).concat(data);
  }
  if (postload) {
    data=data.concat(postload.map(readFile));
  }
  data=data.join("\n");
  if (conf.compress) {
    if (op=='js') {
      data=compressJS(data);
    } else if (op=='css' || op=='css4ie6') {
      data=compressCSS(data);
    }
  }
  fs.writeFileSync(outputFile,data,'utf-8');
  function readFile(p) {
    return fs.readFileSync(p,'utf-8');
  }

}

function loadNSConfs(conf) {
  var nsconfs=conf.nsconfs;
  nsconfs=nsconfs.map(function (file) {
    var defs=getPkgDefs(file);
    var pid=defs.pid;
    var n=defs.body();
    var rootNS=pid.split('.')[0];
    n._fsRootPath=fs.realpathSync(path.dirname(file)+'/..');
    n.rootPath=conf.staticUrls[rootNS] || conf.staticUrls.defaults;
    n.libName=rootNS;
    return n;
  });
  nsconfs.forEach(function (nc) {
    Package.nsConfig(nc.libName,nc);
  });
}

function buildJS(metas) {
  var data=[],nc,tmp;
  var nsconfs=Package._nsconfs;
  if (metas[0] && metas[0].pid=='Package') {
    //Package的初始化方式不一般
    data.push(util.format('var Package=(%s)(this);',Package._pkgMetas['Package'].body.toString()));
    metas.shift();
  }
  data.push('var pm,nsConfig=Package.nsConfig,'+
      'initit=Package.initit,'+
      'prepareMeta=Package.prepareMeta,'+
      'extend=Package.extend;');
  for (var libName in nsconfs) {
    if (libName=='Package') continue;//Package.js也没有nsconf
    nc=nsconfs[libName];
    nc=cleanObj(nc);
    tmp=util.format('nsConfig("%s",%j);',libName,nc);
    data.push(tmp);
  }
  var i,pm,assets;
  for (i=0;i<metas.length;i++) {
    pm=metas[i];
    tmp=util.format('pm=prepareMeta("%s");',pm.pid);
    data.push(tmp);
    data.push(util.format('pm.deps=%j;',pm.deps));
    if (pm.assetDeps) {
      if (pm.customAssetDeps) {//事先将 define时传入的assetDeps也extend到meta上
        if (!pm.loaderAssetDeps) {//需要先判断是否有预定义的assetDeps,有的话使用extend，没有直接赋值
          tmp=util.format('pm.assetDeps=%j;',pm.customAssetDeps);
        } else {
          tmp=util.format('extend(pm.assetDeps,%j);',pm.customAssetDeps);
        }
        data.push(tmp);
      }
      assets=getAssets(pm,'js');
      tmp=util.format('pm.assets=%j;',assets);
      data.push(tmp);
    }
    data.push(util.format('pm.body=%s;',pm.body.toString()));
    data.push(util.format('initit(pm);'));
    if (pm.pid.indexOf('.')==-1) {//声明RootNS为外部变量
      //TODO:使用includes格式时，也要声明var RootLib=Package.getLib('RootLib');
      data.push(util.format('var %s=pm.pkg;',pm.pid));
    }
  }
  data=enclosureOptimize(data);
  //TODO:支持将exportMe设为false
  return data;
}

function buildCSS(metas) {
  var data=[],assets,k,pm;
  for (var i=0;i<metas.length;i++) {
    pm=metas[i];
    assets=getAssets(pm,'css');
    for (k in assets) {
      if (assets.hasOwnProperty(k)) {
        data.push(assets[k]);
      }
    }
  }
  return data;
}

function enclosureOptimize(data) {
  var globalVars=['window','document',
      'Date',
      'parseInt','parseFloat','Math'
        ].join(',');
  data.unshift('(function ('+globalVars+',undefined) {');
    data.push('})('+globalVars+');');
  return data;
}



function expandCSSUrl(url,content) {
  var absPath=url,domain='';
  if (absPath.indexOf(':')>-1) {
    domain=absPath.slice(0,absPath.indexOf('/',10));
    absPath=absPath.slice(absPath.indexOf('/',10)); //10表示跳过"http://"部分
  }
  if (absPath.slice(-1)!='/') {
    absPath=absPath.slice(0,absPath.lastIndexOf('/')+1);
  }
  var re=/\burl\s*\(\s*(["']?)\s*([^()]+)\s*\1\s*\)\s*/img;
  content=content.replace(re,function (a,g1,url2) {
    if (url2.indexOf(':')>-1) {//已经是绝对URL的
      return a;
    }
    if (url2.charAt(0)=='/') {//是从根路径开始的绝对地址
      url2=domain+url2;
    } else  {
      url2=domain+path.normalize(absPath+url2);
    }
    return util.format(' url("%s") ',url2);
  });


  if (content.indexOf(ie6PngFilterCode)!=-1) {

    content=content.replace(ie6PngFilterRe,function (a,src) {
      var url2;
      if (src.indexOf(":")==-1) { //relative url
        url2=domain+path.normalize(absPath+src);
      } else if (src.charAt(0)=='/') {
        url2=domain+url2;
      } else  {
        return a;
      }
      return a.replace(src,url2);
    });
  }

  return content;
}

//type Enum(js|css)
function getAssets(pm,type) {
  var assetDeps=pm.assetDeps,k;
  var assets=[],dir=pm._fsPath,onlyJS=type=='js';
  var atype,relUrl,p;
  assets={};
  for (k in assetDeps) {
    if (assetDeps.hasOwnProperty(k)) {
      if (onlyJS && k.charAt(0)=='_') {//跳过不需要在JS中使用的资源
        continue;
      }
      relUrl=assetDeps[k];
      relUrl=relUrl.split(':');
      if (relUrl.length===1) {
        relUrl=relUrl[0];
        atype=relUrl.split('.').pop();
      } else {
        atype=relUrl[0];
        relUrl=relUrl[1];
      }
      //不是符合条件的资源文件
      if (type!='js' && type!=atype) continue;
      p=path.join(dir,relUrl);
      assets[k]=fs.readFileSync(p,'utf-8');
      if (atype=='json') {
        assets[k]=eval('('+assets[k]+')');
      } else if (atype=='html') {
        assets[k]=compressHTML(assets[k]);
      } else if (atype=='css') {
        assets[k]=expandCSSUrl(pm.path+relUrl,assets[k]);
      }
    }
  }
  return assets;
}


function compressJS(code) {
  return require('uglify-js').minify(code,{fromString: true}).code;
}
function compressCSS(code) {
  var uglifycss=require('uglifycss');
  return uglifycss.processString(code);
}

//压缩HTML，去除注释空白等
function compressHTML(html) {
  return html.replace(/<!--.*?-->/g,'').replace(/>[^<>]+</g,function (a) {
    return '>'+a.slice(1,-1).trim()+'<';
  }).trim();
}


function cleanObj(o) {
  if (Object.prototype.toString.call(o)!='[object Object]') {return o;}
  var ret={};
  for (var p in o) {
    if (!o.hasOwnProperty(p))  continue;
    if (p.indexOf('_')===0) continue;
    ret[p]=cleanObj(o[p]);
  }
  return ret;
}


/**
 * 根据配置文件获取到所有将打包到一起的Package
 * @returns {Object} pkgs
 */
function getBuildPkgs(includes,imported,mode) {
  includes=unique(getExpandedPkgs(includes));
  includes=filterImported(includes,imported);
  var all=withAllDeps(includes,imported);
  var depsTree=all[0],allPkgs=all[1];
  var pkgs=sortDepsTree(depsTree,allPkgs,imported);
  pkgs=filterImported(pkgs,imported);
  if (mode=='includes') {
    pkgs=includes;
  } else {
    if (mode=='deps') {
      pkgs=pkgs.filter(function (x) {
        return includes.indexOf(x)===-1;
      });
    }
    pkgs.unshift('Package');
  }

  return pkgs;

}

function sortDepsTree(depsTree,pkgs,imported) {
  var sorted=[],itsDeps,pid;
  while (pkgs.length) {
    pkgs=pkgs.filter(function (pid) {
      var itsDeps=depsTree[pid];
      if (!itsDeps || !itsDeps.length || isSubSetOf(filterImported(itsDeps,imported),sorted)) {
        sorted.push(pid);
        return false;
      }
      return true;
    });
  }
  return sorted;
}
/**
 * 测试数组a是superSet的子集
 */
function isSubSetOf(a,superSet) {
  if (a.length>superSet.length) return false;
  return a.reduce(function (acc,x) {
    if (acc===false) return false;
    return superSet.indexOf(x) >-1;
  },true);

}

/**
 *
 * @param {[]PackageId} pkgs
 */
function withAllDeps(pkgs,imported) {
  //depsDict,所有查找到的pkg都放在depsDict里，以pid为键，deps数组为值
  var depsDict={};
  do {
    pkgs=pkgs.map(function (pid) {
      if (depsDict.hasOwnProperty(pid)) return pid;
      if (isImported(pid,imported)) {
        return pid;
      }
      var deps=getPkgMeta(pid).deps;
      depsDict[pid]=deps;
      return (deps || []).concat(pid);
    }).flatten();
    pkgs=unique(pkgs);
  } while (!isAllResolved(pkgs));//直到所有提到的pkgs都在depsDict中有deps了
  return [depsDict,pkgs];



  //是否所有的pkg的deps都查询过了,并且deps的deps也查询过了...
  function isAllResolved(pkgs) {
    return pkgs.reduce(function (acc,pid) {
      if (acc===false) return false;
      if (isImported(pid,imported)) return true;
      return depsDict.hasOwnProperty(pid) && depsDict[pid]!==undefined;
    },true);
  }
}


function isImported(pid,imported) {
  if (imported.indexOf(pid) >-1) return true;
  for (var i=0,p;i<imported.length;i++) {
    p=imported[i];
    if (p.slice(-1)=='*') {
      p=p.split('.');
      p.pop();
      p=p.join('.')+'.';
      if (pid.indexOf(p)===0) {
        return true;
      }
    }
  }
  return false;
}

function filterImported(pkgs,imported) {
  return pkgs.filter(function (pid) {
    return !isImported(pid,imported);
  });
}





/**
 * 将includes中NS.util.*形式的Pkg名称扩展成NS.util下面所有的包的名称
 */
function getExpandedPkgs(includes) {
  var allPkgs=unique(includes.map(function (pid) {
    var nsParts=pid.split('.');
    if (nsParts[nsParts.length-1]!='*') {
      return pid;
    }
    nsParts.pop();
    var libName=nsParts[0];
    var nsconf=Package._nsconfs[libName];
    if (!nsconf) {
      throw new Error('Lib `'+libName+'` _nsconf_.js file did not loaded!');
    }
    var fsRootPath=nsconf._fsRootPath;
    var nsDir=[fsRootPath].concat(nsParts).join('/');
    var extname=nsconf.drinkCoffee?'coffee':'js';
    return findPkgsRecursive(nsDir,nsParts,extname);
  }).flatten().filterEmpty());
  return allPkgs;

  function findPkgsRecursive(baseDir,baseNsParts,extname) {
    var all=fs.readdirSync(baseDir);
    return all.map(function (filename) {
      if (filename=="init."+extname) {
        return baseNsParts.join(".");
      }
      var d=path.join(baseDir,filename);
      if (isValidPubVarName(filename) && isDir(d)) {
        if (fs.existsSync(d+"/init."+extname)) {
          return baseNsParts.concat(filename).join('.');
        }
        return findPkgsRecursive(d,baseNsParts.concat(filename),extname);
      }
      var fnparts=filename.split('.'),varname=fnparts[0];
      if (fnparts.length!=2 || fnparts[1]!=extname) {
        return false;
      }
      if (!isValidPubVarName(varname)) {
        return false;
      }
      return baseNsParts.concat(varname).join('.');
    });
  }

}

function isDir(d) {
  return fs.statSync(d).isDirectory();
} 

function isValidPubVarName(varname) {
  var _varnameRe=/^[a-z$][a-z0-9_$]*$/i;
  return _varnameRe.test(varname);
}

function getPkgMeta(pid) {
  var pm;
  if (Package._pkgMetas[pid]) {
    pm=Package._pkgMetas[pid];
  } else {
    pm=Package.prepareMeta(pid);
  }
  if (pm.body) return pm;
  var nsParts=pid.split('.');
  var libName=nsParts[0];
  var nsconf=Package._nsconfs[libName];

  var defs=getPkgDefs(nsconf._fsRootPath+'/'+pm.relUrl);
  pm.deps.unshift.apply(pm.deps,defs.deps);
  pm.loaderAssetDeps=pm.assetDeps;
  pm.customAssetDeps=defs.assetDeps;
  if (defs.assetDeps) {
    if (!pm.assetDeps) {
      pm.assetDeps={};
    }
    extend(pm.assetDeps,defs.assetDeps);
  }
  pm.body=defs.body;
  pm._fsPath=nsconf._fsRootPath+'/'+pm.relPath;
  pm._fsUrl=nsconf._fsRootPath+'/'+pm.relUrl;
  return pm;

}



function getPkgDefs(file) {
  if (!getPkgDefs._cache) {
    getPkgDefs._cache={};
  }
  var cache=getPkgDefs._cache;
  file=path.normalize(file);
  if (cache.hasOwnProperty(file)) {
    return cache[file];
  }
  var defs={};
  var Package={
    define:function(pid) {
      var args=[].slice.call(arguments);
      var body=args[args.length-1];
      var deps=util.isArray(args[1])?args[1]:null;
      var ad=args[args.length-2];
      if (typeof ad==='string' || util.isArray(ad)) {
        ad=null;
      }
      defs.body=body;
      defs.deps=deps;
      defs.assetDeps=ad;
      defs.pid=pid;
    }
  };
  var OrigPkg=global.Package;
  global.Package=Package;
  try {
    require(file);
  } catch (e) {
    console.error('Error in execute js:'+file);
    throw e;
  } finally {
    global.Package=OrigPkg;
  }
  cache[file]=defs;
  return defs;

}


function unique(ary) {
  var i = 0,tp, objs = [],j, ol, tr = false,
      hash = {
        'string': {},
        'boolean': {},
        'number': {}
      },
      p, l = ary.length,ret = [];
  for (; i < l; i++) {
    p = ary[i];
    if (p == null) continue;
    tp = typeof p;
    if (tp in hash) {
      if (!(p in hash[tp])) {
        hash[tp][p] = 1;
        ret.push(p);
      }
    }
    else {
      j = 0;ol = objs.length;
      while (j < ol && (objs[j] !== p) && ++j);
      if (j == ol) {
        ret.push(p);
        objs.push(p);
      }
    }
  }
  return ret;
}

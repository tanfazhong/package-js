Package.define('Test.ui.Ct',['Test.dom.Style','Test.dom.Node'],function () {
  var btn=this.assets.tpl;
  function Ct(ct) {
    ct.innerHTML+=btn;
  }

  return Ct;
});

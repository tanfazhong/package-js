Package.define('Test.ui.Button',['Test.query'],function (query) {
  var btn=this.assets.tpl;
  function Button(ct) {
    ct.innerHTML=btn;
  }

  return Button;
});

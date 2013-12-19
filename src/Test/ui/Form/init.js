Package.define('Test.ui.Form',['Test.$','Test.util.Cookie'],{
  msg:'str:msg.txt'
},function ($) {
  var tpl=this.assets.tpl,msg=this.assets.msg;
  function Form(ct) {
    ct.innerHTML+=tpl+msg;
  }

  return Form;
});

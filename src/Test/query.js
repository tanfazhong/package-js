Package.define('Test.query',['Test.util.String'],function () {
  function query(id) {
    return document.getElementById(id);
  }

  return query;
});

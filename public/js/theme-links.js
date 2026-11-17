(function(){
  var path = String(location.pathname || '').replace(/\/+$/, '');
  var detail = path.match(/^\/themes\/([^/]+)$/);
  function makeDemo(url){
    var a = document.createElement('a');
    a.className = 'nx-btn-ghost';
    a.dataset.liveDemo = '1';
    a.href = url;
    a.target = '_blank';
    a.rel = 'noopener';
    a.textContent = 'Live Demo';
    a.style.marginLeft = '8px';
    return a;
  }
  fetch('/api/themes', { cache: 'no-store' }).then(function(r){ return r.json(); }).then(function(list){
    if(!Array.isArray(list)) return;
    if(detail){
      var theme = list.filter(function(t){ return t && t.slug === detail[1]; })[0];
      if(!theme || !theme.demo_url) return;
      var buy = document.querySelector('main a[href^="/checkout?kind=theme"]');
      if(!buy || document.querySelector('[data-live-demo]')) return;
      var demo = makeDemo(theme.demo_url);
      demo.style.marginLeft = '0';
      demo.style.marginRight = '8px';
      buy.parentNode.insertBefore(demo, buy);
      return;
    }
    list.forEach(function(theme){
      if(!theme || !theme.demo_url) return;
      var cards = document.querySelectorAll('.nx-card');
      Array.prototype.forEach.call(cards, function(card){
        var link = card.querySelector('a[href="/themes/' + theme.slug + '"]');
        if(!link || card.querySelector('[data-live-demo]')) return;
        link.parentNode.insertBefore(makeDemo(theme.demo_url), link.nextSibling);
      });
    });
  }).catch(function(){});
})();

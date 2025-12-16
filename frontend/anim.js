// anim.js — particles + scroll-reveal + parallax (no external libs)

// ---------- PARTICLES ----------
(function(){
    const canvas = document.getElementById('bgParticles');
    if(!canvas) return;
    const ctx = canvas.getContext('2d');
    let w, h, particles;
  
    function resize(){
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
      particles = new Array(Math.floor(w*h/24000)).fill(0).map(()=>({
        x: Math.random()*w,
        y: Math.random()*h,
        r: Math.random()*1.6 + .4,
        vx: (Math.random()-.5)*.3,
        vy: (Math.random()-.5)*.3,
        hue: 180 + Math.random()*120
      }));
    }
    function tick(){
      ctx.clearRect(0,0,w,h);
      for(const p of particles){
        p.x += p.vx; p.y += p.vy;
        if(p.x<0||p.x>w) p.vx*=-1;
        if(p.y<0||p.y>h) p.vy*=-1;
        ctx.beginPath();
        ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
        ctx.fillStyle = `hsla(${p.hue}, 80%, 65%, .35)`;
        ctx.fill();
      }
      requestAnimationFrame(tick);
    }
    window.addEventListener('resize', resize);
    resize(); tick();
  })();
  
  // ---------- SCROLL REVEAL ----------
  (function(){
    const groups = document.querySelectorAll('.reveal');
    if(!groups.length) return;
    const io = new IntersectionObserver((entries)=>{
      entries.forEach(e=>{
        if(e.isIntersecting){
          e.target.classList.add('in');
          io.unobserve(e.target);
        }
      });
    }, {threshold:.12});
    groups.forEach(g=>io.observe(g));
  })();
  
  // ---------- PARALLAX FLOATERS ----------
  (function(){
    const items = document.querySelectorAll('[data-parallax]');
    if(!items.length) return;
    window.addEventListener('mousemove', (e)=>{
      const cx = window.innerWidth/2;
      const cy = window.innerHeight/2;
      const dx = (e.clientX - cx)/cx; // -1..1
      const dy = (e.clientY - cy)/cy;
      items.forEach((el,i)=>{
        const strength = 6 + i*3;
        el.style.transform = `translate(${dx*strength}px, ${dy*strength}px)`;
      });
    });
  })();
  
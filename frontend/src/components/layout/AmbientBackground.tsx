'use client';

import { useEffect, useRef } from 'react';

export default function AmbientBackground() {
  const bgRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const bg = bgRef.current;
    if (!bg) return;
    
    const numOrbs = 6;
    const orbs: any[] = [];
    const colors = ['bg-primary', 'bg-secondary', 'bg-tertiary-container', 'bg-primary-container'];
    
    for (let i = 0; i < numOrbs; i++) {
        const orb = document.createElement('div');
        orb.className = `orb animate-blob ${colors[i % colors.length]}`;
        
        const size = Math.random() * 400 + 200;
        orb.style.width = `${size}px`;
        orb.style.height = `${size}px`;
        
        const startX = Math.random() * 100;
        const startY = Math.random() * 100;
        
        orb.style.left = `calc(${startX}vw - ${size/2}px)`;
        orb.style.top = `calc(${startY}vh - ${size/2}px)`;
        
        orb.style.animationDuration = `${Math.random() * 15 + 10}s`;
        orb.style.animationDelay = `${Math.random() * 5}s`;
        
        bg.appendChild(orb);
        
        orbs.push({
            element: orb,
            baseX: startX,
            baseY: startY,
            vx: (Math.random() - 0.5) * 0.1,
            vy: (Math.random() - 0.5) * 0.1,
            offsetX: 0,
            offsetY: 0
        });
    }
    
    let mouseX = window.innerWidth / 2;
    let mouseY = window.innerHeight / 2;
    
    const handleMouseMove = (e: MouseEvent) => {
        mouseX = e.clientX;
        mouseY = e.clientY;
        
        orbs.forEach((orb) => {
            const rect = orb.element.getBoundingClientRect();
            const orbCenterX = rect.left + rect.width / 2;
            const orbCenterY = rect.top + rect.height / 2;
            
            const dx = mouseX - orbCenterX;
            const dy = mouseY - orbCenterY;
            const dist = Math.sqrt(dx*dx + dy*dy);
            
            // Repel effect when mouse is close
            if (dist < 500) {
                const force = (500 - dist) / 500;
                orb.offsetX = -(dx / dist) * force * 100;
                orb.offsetY = -(dy / dist) * force * 100;
            } else {
                orb.offsetX *= 0.9;
                orb.offsetY *= 0.9;
            }
            
            orb.element.style.transform = `translate(${orb.offsetX}px, ${orb.offsetY}px)`;
        });
    };

    window.addEventListener('mousemove', handleMouseMove);
    
    let animationFrameId: number;
    function animate() {
        orbs.forEach(orb => {
            orb.baseX += orb.vx;
            orb.baseY += orb.vy;
            
            if (orb.baseX < -10 || orb.baseX > 110) orb.vx *= -1;
            if (orb.baseY < -10 || orb.baseY > 110) orb.vy *= -1;
            
            orb.element.style.left = `calc(${orb.baseX}vw - ${orb.element.offsetWidth/2}px)`;
            orb.element.style.top = `calc(${orb.baseY}vh - ${orb.element.offsetHeight/2}px)`;
        });
        animationFrameId = requestAnimationFrame(animate);
    }
    animate();

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      cancelAnimationFrame(animationFrameId);
      if (bg) bg.innerHTML = ''; // Cleanup orbs
    };
  }, []);

  return (
    <div 
      ref={bgRef} 
      className="fixed inset-0 z-[-1] overflow-hidden pointer-events-none bg-background" 
      id="ambient-background"
    />
  );
}

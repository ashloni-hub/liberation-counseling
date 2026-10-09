// Sticky header: tint background once scrolled
const headerWrap = document.getElementById('headerWrap');
if (headerWrap) {
  function updateHeaderState() {
    headerWrap.classList.toggle('is-scrolled', window.scrollY > 10);
  }
  updateHeaderState();
  window.addEventListener('scroll', updateHeaderState, { passive: true });
}

// Mobile nav toggle
const navToggle = document.getElementById('navToggle');
const primaryNav = document.getElementById('primaryNav');

navToggle.addEventListener('click', () => {
  const isOpen = primaryNav.classList.toggle('is-open');
  navToggle.setAttribute('aria-expanded', String(isOpen));
});

primaryNav.querySelectorAll('a').forEach((link) => {
  link.addEventListener('click', () => {
    primaryNav.classList.remove('is-open');
    navToggle.setAttribute('aria-expanded', 'false');
  });
});

// Scroll-reveal animation
const revealEls = document.querySelectorAll('.reveal');
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

if (prefersReducedMotion) {
  revealEls.forEach((el) => el.classList.add('is-visible'));
} else {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('is-visible');
          observer.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.15 }
  );
  revealEls.forEach((el) => observer.observe(el));
}

// Hero image carousel
const heroCarousel = document.getElementById('heroCarousel');
if (heroCarousel) {
  const slides = [...heroCarousel.querySelectorAll('.hero-slide')];
  const dots = [...heroCarousel.querySelectorAll('.hero-dot')];
  let activeIndex = 0;
  let carouselTimer;

  function goToSlide(index) {
    slides[activeIndex].classList.remove('is-active');
    dots[activeIndex].classList.remove('is-active');
    activeIndex = index;
    slides[activeIndex].classList.add('is-active');
    dots[activeIndex].classList.add('is-active');
  }

  function startCarousel() {
    carouselTimer = setInterval(() => {
      goToSlide((activeIndex + 1) % slides.length);
    }, 5000);
  }

  if (!prefersReducedMotion && slides.length > 1) {
    startCarousel();
    dots.forEach((dot, i) => {
      dot.addEventListener('click', () => {
        clearInterval(carouselTimer);
        goToSlide(i);
        startCarousel();
      });
    });
  }
}

// Contact form -> posts to the Worker's /api/contact route (see src/worker.js).
// On failure the Worker redirects back here with ?error=1; show the banner.
const ctaFormError = document.getElementById('ctaFormError');
if (ctaFormError && new URLSearchParams(window.location.search).get('error') === '1') {
  ctaFormError.hidden = false;
}

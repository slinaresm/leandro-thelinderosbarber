import { Cinema } from './cinema';
import { Services, Barbers } from './catalog';
import { Faq } from './faq';
export function HomeEditorial() { return (<main id="contenido">
<Cinema />
<div className="craft-strip" aria-label="Nuestra filosofía"><span>CORTE A TIJERA</span><i>✦</i><span>BARBA &amp; NAVAJA</span><i>✦</i><span>OFICIO DE CABALLEROS</span><i>✦</i><span>ESTILO QUE PERDURA</span><i>✦</i></div>
<section id="servicios" className="services-section section-space">
  <div className="section-top"><div><p className="overline">LA CARTA DE LA CASA</p><h2>Cortes de cabello y barba.<br /><em>Tu estilo, a tu medida.</em></h2></div><p>Conoce los servicios de nuestra barbería de caballeros: corte de cabello, arreglo de barba y cuidado masculino. Compara precios y duración, elige a tu barbero y reserva tu hora en línea.</p></div>
  <Services />
</section>
<section id="espiritu" className="craft-interlude" aria-labelledby="craft-title">
  <div className="craft-copy"><p className="overline">EL ESPÍRITU LINDEROS</p><h2 id="craft-title">Barbería clásica.<br /><em>Estilo que se siente propio.</em></h2><p>En Barber Linderos, el corte de cabello para hombre empieza con una conversación. Escuchamos cómo llevas tu pelo y qué buscas para trabajar una forma que vaya contigo.</p><p>Combinamos la técnica de la barbería tradicional con cortes actuales y un arreglo de barba cuidado. Tijera, peine y atención al detalle: el oficio de siempre al servicio de tu estilo.</p><a className="text-link" href="/reservar">Reserva con tu barbero <span aria-hidden="true">↗</span></a></div>
  <picture className="craft-photo"><source srcSet="/assets/img/barbero-corte-cabello-linderos-900.webp 900w, /assets/img/barbero-corte-cabello-linderos.webp 1800w" sizes="(max-width: 760px) 100vw, 55vw" type="image/webp" /><img src="/assets/img/barbero-corte-cabello-linderos.webp" alt="Barbero trabajando un corte de cabello de caballero con tijera y peine en una barbería de estilo clásico" width="1800" height="1005" loading="lazy" decoding="async" /></picture>
</section>
<section id="barberos" className="team-section section-space"><div className="section-top"><div><p className="overline">LAS MANOS DETRÁS DEL OFICIO</p><h2>Tu próximo<br /><em>barbero de confianza.</em></h2></div><a className="text-link" href="/reservar">Conoce su disponibilidad <span>↗</span></a></div><Barbers /></section>
<section id="tienda" className="shop-section section-space" aria-labelledby="shop-title">
  <figure className="shop-visual">
    <picture><source srcSet="/assets/img/productos-barberia-linderos-800.webp 800w, /assets/img/productos-barberia-linderos.webp 1448w" sizes="(max-width: 760px) 86vw, 43vw" type="image/webp" /><img src="/assets/img/productos-barberia-linderos.webp" alt="Selección referencial de productos de barbería: aceite para barba, pomada, champú, brocha de afeitar y peine sobre un mesón de madera" width="1448" height="1086" loading="lazy" decoding="async" /></picture>
    <figcaption>Imagen referencial de productos para el cuidado masculino.</figcaption>
  </figure>
  <div className="shop-copy"><p className="overline">LA TIENDA LINDEROS</p><h2 id="shop-title">Productos de barbería.<br /><em>Tu estilo sigue en casa.</em></h2>
    <p>El cuidado del cabello y la barba continúa después de tu visita. Explora nuestra tienda de productos de barbería y encuentra opciones para complementar tu rutina de cuidado masculino.</p>
    <p>Peinar, dar forma y cuidar los detalles: descubre el catálogo y elige los productos que acompañan tu estilo entre un corte y el siguiente.</p>
    <ul className="shop-uses" aria-label="Ideas para tu rutina de cuidado"><li>Peinado y acabado</li><li>Cuidado de la barba</li><li>Rutina diaria</li></ul>
    <a className="v-button" href="/tienda">Ver productos de barbería <span aria-hidden="true">↗</span></a>
    <span className="shop-note">Consulta precios y disponibilidad en la tienda.</span>
  </div>
</section>
<Faq />
<section id="reserva" className="closing-section" aria-labelledby="closing-title">
  <picture className="closing-photo" aria-hidden="true"><source srcSet="/assets/img/reserva-sillon-barberia-linderos-900.webp 900w, /assets/img/reserva-sillon-barberia-linderos.webp 1800w" sizes="100vw" type="image/webp" /><img src="/assets/img/reserva-sillon-barberia-linderos.webp" alt="" width="1800" height="1005" loading="lazy" decoding="async" /></picture>
  <div className="closing-overlay" aria-hidden="true"></div>
  <div className="closing-content"><p className="overline">TU SILLÓN TE ESPERA</p><h2 id="closing-title">Reserva tu próximo corte.<br /><em>Haz tiempo para ti.</em></h2><p className="closing-description">Dale forma a tu estilo en Barber Linderos. Elige un corte de cabello, un arreglo de barba o un servicio de cuidado masculino y reserva tu hora en línea.</p>
    <ul className="closing-benefits" aria-label="Cómo preparar tu visita"><li>Elige tu servicio</li><li>Encuentra a tu barbero</li><li>Consulta los horarios</li></ul>
    <div className="closing-actions"><a className="v-button" href="/reservar">Reservar mi hora <span aria-hidden="true">↗</span></a><a className="closing-secondary" href="#servicios">Consultar servicios y precios <span aria-hidden="true">↓</span></a></div>
    <p className="closing-signin">¿Ya tienes una reserva? <a href="/mi-cuenta/reservas">Entra a tu cuenta y gestiona tu cita <span aria-hidden="true">↗</span></a></p>
    <p className="closing-reassurance">Revisa el servicio y el horario antes de confirmar. Para completar la reserva, inicia sesión o crea tu cuenta.</p>
  </div>
</section>
</main>); }

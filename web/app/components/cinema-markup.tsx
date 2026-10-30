import type React from 'react';
export function CinemaMarkup() { return (<section id="ritual" className="cinema-story" aria-label="El ritual Linderos, una experiencia cinematográfica">
  <div className="cinema-stage">
    <div className="cinema-backdrop" aria-hidden="true">
      <video id="barber-film" muted={true} playsInline={true} preload="none" poster="/assets/img/barber-film-poster.jpg" disablePictureInPicture={true} tabIndex={-1} aria-hidden="true"></video>
    </div>
    <div className="cinema-shade" aria-hidden="true"></div>
    <div className="cinema-copy">
      <article className="cinema-panel is-active" data-scene="0" aria-labelledby="hero-title">
        <p className="overline"><span></span> BUEN OFICIO. BUENA CONVERSACIÓN.</p>
        <h1 id="hero-title">El buen estilo<br />no pasa<br /><em>de moda.</em></h1>
        <p className="cinema-description">Cortes con carácter. Barbas bien hechas.<br />El ritual de siempre, a tu manera.</p>
        <div className="hero-actions"><a className="v-button" href="/reservar">Toma asiento <span>↗</span></a><a id="cinema-discover" className="text-link" href="#film-title-1">Descubre el ritual <span>↓</span></a></div>
      </article>
      <article className="cinema-panel" data-scene="1" aria-labelledby="film-title-1">
        <p className="overline">01 / EL OFICIO</p><h2 id="film-title-1">Cada herramienta.<br /><em>Todo un oficio.</em></h2>
        <p className="cinema-description">Tijera, peine y manos expertas.<br />La tradición está en los detalles.</p>
      </article>
      <article className="cinema-panel" data-scene="2" aria-labelledby="film-title-2">
        <p className="overline">02 / TU MOMENTO</p><h2 id="film-title-2">Deja la prisa<br /><em>en la puerta.</em></h2>
        <p className="cinema-description">Tu sillón. Tu barbero. Tu momento.<br />Un estilo que empieza por escucharte.</p>
      </article>
      <article className="cinema-panel" data-scene="3" aria-labelledby="film-title-3">
        <p className="overline">03 / EL DETALLE</p><h2 id="film-title-3">Más cerca.<br /><em>Más carácter.</em></h2>
        <p className="cinema-description">Cada contorno, cada textura, cada acabado.<br />La diferencia se ve de cerca.</p>
      </article>
      <article className="cinema-panel" data-scene="4" aria-labelledby="film-title-4">
        <p className="overline">04 / TU SELLO</p><h2 id="film-title-4">El ritual termina.<br /><em>Tu estilo sigue.</em></h2>
        <p className="cinema-description">Un último vistazo al espejo.<br />Y la confianza de salir siendo tú.</p>
        <div className="hero-actions"><a className="v-button" href="/reservar">Reserva tu momento <span>↗</span></a><a className="text-link" href="#servicios">Ver servicios <span>↓</span></a></div>
      </article>
    </div>
    <div className="cinema-controls"><button id="cinema-motion" type="button" hidden={true}>Ver sin animación</button><a href="#servicios">Saltar a servicios ↘</a></div>
    <div className="cinema-bottom"><span id="cinema-caption">EL RITUAL LINDEROS</span><span className="cinema-instruction">DESLIZA PARA VIVIR EL RITUAL ↓</span><span id="cinema-count" aria-hidden="true">01 / 05</span></div>
    <div className="cinema-progress" aria-hidden="true"><span></span></div>
  </div>
  <span id="paso-1" className="cinema-marker" style={{"--position": "20%"} as React.CSSProperties} aria-hidden="true"></span>
  <span id="paso-2" className="cinema-marker" style={{"--position": "40%"} as React.CSSProperties} aria-hidden="true"></span>
  <span id="paso-3" className="cinema-marker" style={{"--position": "60%"} as React.CSSProperties} aria-hidden="true"></span>
  <span id="paso-4" className="cinema-marker" style={{"--position": "80%"} as React.CSSProperties} aria-hidden="true"></span>
</section>); }

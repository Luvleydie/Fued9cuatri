import { Component } from '@angular/core';

@Component({
  selector: 'app-barrio-radio',
  standalone: true,
  template: `
    <details class="barrio-radio" aria-label="Reproductor de música del barrio">
      <summary aria-label="Abrir o cerrar Radio del Barrio">
        <span class="radio-note" aria-hidden="true">♫</span>
        <span>RADIO DEL BARRIO<small>Una cumbia para el camino</small></span>
        <span class="radio-toggle" aria-hidden="true">+</span>
      </summary>
      <div class="radio-body">
        <p><strong>Cumbia de la ruta</strong><span>Instrumental original</span></p>
        <audio controls preload="none" loop aria-label="Escuchar Cumbia de la ruta, instrumental original"
          src="assets/music/cumbia-de-la-ruta.wav">
          Tu navegador no puede reproducir este audio.
        </audio>
        <small>Tú le das play. ¡Súbale, hay lugares!</small>
      </div>
    </details>
  `,
  styles: [`
    :host { position: fixed; right: 18px; bottom: max(18px, env(safe-area-inset-bottom)); z-index: 1000; width: 280px; max-width: calc(100vw - 28px); }
    .barrio-radio { color: #202817; background: #fff7d9; border: 2px solid #263021; border-radius: 5px; box-shadow: 4px 4px 0 #c63830; font-family: Arial, sans-serif; }
    summary { display: flex; align-items: center; gap: 10px; min-height: 44px; padding: 8px 12px; box-sizing: border-box; color: #fff9e6; background: #167245; border-radius: 2px; cursor: pointer; list-style: none; font-size: 12px; font-weight: 900; letter-spacing: .4px; }
    summary::-webkit-details-marker { display: none; }
    summary:focus-visible { outline: 3px solid #f5c329; outline-offset: 4px; }
    summary small { display: block; margin-top: 3px; color: #fff0b5; font-size: 10px; font-weight: 400; letter-spacing: 0; }
    .radio-note { font-size: 27px; color: #ffdf67; line-height: 1; }
    .radio-toggle { margin-left: auto; font-size: 21px; }
    details[open] .radio-toggle { transform: rotate(45deg); }
    .radio-body { padding: 12px; border-top: 3px solid #d33631; }
    .radio-body p { margin: 0 0 9px; font-size: 13px; line-height: 1.4; }
    .radio-body p span { display: block; font-size: 11px; color: #606041; }
    audio { display: block; width: 100%; height: 36px; }
    .radio-body > small { display: block; margin-top: 9px; color: #685732; font-size: 10px; }
    @media (max-width: 600px) { :host { right: 12px; bottom: max(12px, env(safe-area-inset-bottom)); width: 260px; } }
  `],
})
export class BarrioRadioComponent {}

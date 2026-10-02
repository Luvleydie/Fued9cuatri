import { Component } from '@angular/core';
import { connectionState } from './api/connection-state';

@Component({
  selector: 'app-connection-notice',
  standalone: true,
  template: `
    <p class="connection-notice" role="status" aria-live="polite" data-testid="connection-status"
      [class.connection-warning]="connection.offline() || connection.apiUnavailable()">
      @if (connection.offline()) {
        Sin conexión. Puedes consultar datos guardados; necesitas red para iniciar sesión o guardar cambios.
      } @else if (connection.apiUnavailable()) {
        Red disponible, pero no se pudo contactar con el servicio. Intenta actualizar los datos.
      } @else {
        Red disponible. Puedes actualizar los datos para consultar la información más reciente.
      }
    </p>
  `,
})
export class ConnectionNoticeComponent {
  readonly connection = connectionState;
}

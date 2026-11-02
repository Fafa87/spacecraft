/**
 * Why a P2P join failed, in words a player can act on (Polish UI). Pure, unit tested.
 * PeerJS error types: https://peerjs.com/client/api (peer-unavailable, network, server-error,
 * socket-error, socket-closed, browser-incompatible, unavailable-id, negotiation-failed …).
 */
export type JoinFailure =
  | 'signaling' // the PeerJS pairing server (0.peerjs.com) is unreachable
  | 'not-found' // no host registered under that code (wrong code / host left / host app in background)
  | 'ice-failed' // host found, but WebRTC could not open a path (mobile-data / carrier NAT, no TURN)
  | 'timeout' // nothing conclusive within the time limit
  | 'unsupported'; // this browser has no WebRTC data channels

export function classifyPeerError(type: string | undefined): JoinFailure | null {
  switch (type) {
    case 'peer-unavailable':
      return 'not-found';
    case 'network':
    case 'server-error':
    case 'socket-error':
    case 'socket-closed':
    case 'disconnected':
      return 'signaling';
    case 'browser-incompatible':
      return 'unsupported';
    case 'negotiation-failed':
    case 'webrtc':
      return 'ice-failed';
    default:
      return null;
  }
}

export function joinErrorMessage(kind: JoinFailure, code: string, relay: boolean): string {
  switch (kind) {
    case 'signaling':
      return 'Brak połączenia z serwerem parowania (PeerJS, 0.peerjs.com). Sprawdź internet i spróbuj ponownie za chwilę.';
    case 'not-found':
      return `Nie znaleziono pokoju ${code}. Sprawdź kod. Gospodarz musi mieć grę otwartą na ekranie pokoju — na telefonie nie przełączaj aplikacji ani nie blokuj ekranu.`;
    case 'ice-failed':
      return `Pokój ${code} jest, ale nie udało się zestawić połączenia między urządzeniami${
        relay ? ' (również przez serwer TURN)' : ''
      }. Tak bywa na danych komórkowych (NAT operatora). Połączcie się z tym samym Wi-Fi albo włącz hotspot na jednym telefonie i podłącz do niego drugi.`;
    case 'unsupported':
      return 'Ta przeglądarka nie obsługuje połączeń WebRTC. Użyj aktualnego Chrome lub Safari.';
    case 'timeout':
    default:
      return `Przekroczono czas łączenia z pokojem ${code}. Spróbuj ponownie; jeśli to się powtarza na danych komórkowych, połączcie się z tym samym Wi-Fi.`;
  }
}

/** Error carrying the failure kind (the UI shows `message`). */
export class JoinError extends Error {
  constructor(
    readonly kind: JoinFailure,
    message: string,
  ) {
    super(message);
    this.name = 'JoinError';
  }
}

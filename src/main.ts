import './style.css';

if (!document.querySelector<HTMLCanvasElement>('#viewport')) {
  throw new Error('Brak elementu canvas #viewport');
}

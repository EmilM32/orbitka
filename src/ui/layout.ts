// Owner of layout.css. main.ts cannot import the stylesheet directly:
// orbitka/stylesheet-location only allows src/ui/x.ts to import ./x.css.
// main.ts imports this module after the other UI modules so these rules win.
import './layout.css';

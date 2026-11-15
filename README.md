# Little Toys

A home for small browser experiments: little toys, demos, and playgrounds.
Each one lives in its own directory and is a self-contained static page with
no build step.

Browse them all from [`index.html`](index.html), or on GitHub Pages at
<https://danielbeardsley.github.io/little-toys/>.

## Toys

- [`gamepad-demo/`](gamepad-demo/): Gamepad API Playground, a live look at
  what the browser's Gamepad API reports for every connected controller.

## Adding a toy

1. Make a new directory with an `index.html` in it.
2. Use only relative paths (`js/main.js`, not `/js/main.js`) so it works when
   served from a subdirectory such as GitHub Pages.
3. Add a link to it in the top-level `index.html` and in the list above.

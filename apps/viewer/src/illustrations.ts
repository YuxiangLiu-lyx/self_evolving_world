/** Local vector artwork only. Imported names and identifiers never become markup. */
function illustration(markup: string): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 48 48');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  svg.innerHTML = markup;
  return svg;
}

export function characterIllustration(index: number): SVGSVGElement {
  const coats = [
    '#efbe67',
    '#9ec7ad',
    '#e99e83',
    '#94c4df',
    '#c8b1e0',
    '#b9cc7f',
  ];
  const coat = coats[index % coats.length] ?? '#efbe67';
  const hats = [
    '<path d="M12 17q0-12 12-12t12 12" fill="#b18d52"/><path d="M8 18h32" stroke="#e4c487" stroke-width="5" stroke-linecap="round"/>',
    '<path d="M13 17q-1-13 11-13t11 13" fill="#567b65"/><path d="M12 17h24" stroke="#b6dac5" stroke-width="5"/><circle cx="24" cy="4" r="3" fill="#e6d7a0"/>',
    '<path d="M12 18q-2-14 12-14t12 14l-6-5-9 2-6-4z" fill="#754d43"/><path d="M13 14h22" stroke="#de9872" stroke-width="3"/>',
  ];
  return illustration(
    `<ellipse cx="24" cy="44" rx="17" ry="3" fill="#102b32" opacity=".4"/><path d="M16 34v7m16-7v7" stroke="#344952" stroke-width="6" stroke-linecap="round"/><rect x="10" y="24" width="28" height="13" rx="6" fill="#826b4d"/><path d="M16 27l-5 9m21-9 5 9" stroke="${coat}" stroke-width="6" stroke-linecap="round"/><path d="M16 25h16v14H16z" fill="${coat}"/><path d="M21 27v11" stroke="#ffffff" opacity=".3" stroke-width="2"/><rect x="14" y="10" width="20" height="18" rx="9" fill="#f2d0a3"/><path d="M19 19h1m8 0h1" stroke="#354047" stroke-width="2.5" stroke-linecap="round"/><path d="M22 23q2 2 4 0" fill="none" stroke="#b57b63" stroke-width="1.5"/>${hats[index % hats.length] ?? ''}`,
  );
}

const itemArtwork: Readonly<Record<string, string>> = {
  mushroom:
    '<path fill="#e9d6ab" d="M20 23h9l3 20H17z"/><path fill="#c4a07a" stroke="#f3dbac" stroke-width="2" d="M4 25Q6 2 24 4q18-2 20 21z"/><circle cx="16" cy="16" r="3" fill="#efdcba"/><circle cx="31" cy="14" r="3" fill="#efdcba"/>',
  wood: '<path d="M9 34 28 13l12 9-19 21z" fill="#a77745" stroke="#efcb8e" stroke-width="2"/><path d="m14 32 17-17m-9 23 15-16" stroke="#6c4b31" stroke-width="2"/><ellipse cx="15" cy="36" rx="8" ry="6" transform="rotate(40 15 36)" fill="#dfb776"/><ellipse cx="15" cy="36" rx="4" ry="3" transform="rotate(40 15 36)" fill="none" stroke="#9c713f" stroke-width="2"/>',
  stone:
    '<path d="m5 33 7-17 17-8 13 13-2 17-25 4z" fill="#a3b8bb" stroke="#dbe8df" stroke-width="2"/><path d="m12 16 11 12 19-7M23 28l-8 14" fill="none" stroke="#6d8b94" stroke-width="3"/><path d="m12 16 17-8-6 20" fill="#c6d5cf"/>',
  berry:
    '<path d="M25 20q-4-14 8-15" fill="none" stroke="#adc586" stroke-width="3"/><path d="M24 15Q10 4 11 15q4 7 13 0" fill="#80b47c"/><g fill="#cf7890" stroke="#f6c3ba" stroke-width="1.5"><circle cx="17" cy="25" r="8"/><circle cx="31" cy="24" r="8"/><circle cx="24" cy="36" r="8"/></g><path d="m14 22 3-2m10 2 3-2m-9 13 3-2" stroke="#ffe2d5" stroke-width="2"/>',
  crystal:
    '<path d="m24 3 13 13-2 20-11 10L11 34l-1-17z" fill="#94c4e8" stroke="#e2e5ff" stroke-width="2"/><path d="m24 3 4 18-4 25-6-25z" fill="#dfd7ff"/><path d="m10 17 18 4 9-5M11 34l13 12 11-10" fill="none" stroke="#798cc9" stroke-width="2"/>',
  seed: '<path d="M24 44c-23-12-18-30-3-27 18-12 31 7 3 27" fill="#dcbf7c" stroke="#f5e2a4" stroke-width="2"/><path d="M24 37V15" stroke="#698753" stroke-width="3"/><path d="M24 21C7 22 6 6 12 5q12 1 12 16m0-5C24 4 36 3 40 6q-2 12-16 10" fill="#a8c787"/>',
  water:
    '<path d="M24 3C20 14 8 23 8 31a16 16 0 0 0 32 0C40 23 28 14 24 3" fill="#71bbd4" stroke="#c8eef0" stroke-width="2"/><path d="M15 29q-3 8 6 10" fill="none" stroke="#def7ec" stroke-width="3" stroke-linecap="round"/>',
};

export function itemIllustration(id: string): SVGSVGElement {
  return illustration(
    itemArtwork[id] ??
      '<path d="m24 6 17 10v23L24 46 7 37V16z" fill="#bda980" stroke="#f2d6a0" stroke-width="2"/><path d="m7 16 17 9 17-9M24 25v21" fill="none" stroke="#806b4a" stroke-width="2"/>',
  );
}

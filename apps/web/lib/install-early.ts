// Written into the head of every page, so it runs before anything else of
// PrePenny's (step 4d, D554): Chrome's offer to install PrePenny, and its
// word that PrePenny was added, can come as soon as a page has loaded,
// before the app's own code has started. Kept back and kept here, they're
// picked up by lib/install.ts once it starts. Our own fixed script, with no
// data in it; the security policy lists it by its fingerprint (D529).

/** Where the offer waits, and the word that PrePenny was added. */
export const EARLY_OFFER = '__prepennyOffer';
export const EARLY_INSTALLED = '__prepennyInstalled';

export const installEarlyScript = `(function(){try{addEventListener('beforeinstallprompt',function(e){e.preventDefault();window.${EARLY_OFFER}=e});addEventListener('appinstalled',function(){window.${EARLY_INSTALLED}=true;window.${EARLY_OFFER}=null})}catch(e){}})()`;

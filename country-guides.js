import fs from 'fs';

const data = JSON.parse(fs.readFileSync(new URL('./data/countries.json', import.meta.url), 'utf8'));
export const COUNTRY_GUIDES = Array.isArray(data.countries) ? data.countries : [];
export const COUNTRY_GUIDE_COUNT = COUNTRY_GUIDES.length;
const COUNTRY_BY_SLUG = new Map(COUNTRY_GUIDES.map(c => [c.slug, c]));

const esc = (value) => String(value == null ? '' : value).replace(/[&<>"']/g, ch => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;'
}[ch]));

function hash(value){
  let h = 2166136261;
  const s = String(value || '');
  for(let i = 0; i < s.length; i++){ h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return h >>> 0;
}

function pick(pool, seed, count){
  return pool
    .map(item => ({ item, key: hash(seed + ':' + item.title) }))
    .sort((a, b) => a.key - b.key)
    .slice(0, count)
    .map(row => row.item);
}

const PROFILES = {
  africa: {
    label: 'Africa',
    payment: 'Card acceptance, bank transfer, mobile money and cash-on-delivery expectations vary widely across African markets. Confirm which options your gateway can approve for a business registered in your target market, and test a live low-value transaction before launch.',
    shipping: 'Delivery speed can differ sharply between capital cities, secondary cities and rural areas. Use suppliers with tracked shipping, show a realistic delivery window, and publish a returns process that matches what the supplier can actually support.',
    tax: 'Import duty, VAT and business registration thresholds differ by country. Confirm the rules for your target market with a local accountant before you import stock, hold inventory or scale paid traffic.',
    channels: ['Meta ads', 'TikTok', 'WhatsApp-assisted sales', 'Google Search'],
    trust: 'local payment logos, delivery clarity, WhatsApp support and visible return terms'
  },
  northAmerica: {
    label: 'North America',
    payment: 'Card payments dominate, but wallets, buy-now-pay-later and platform-specific checkout options can affect conversion. Chargebacks and payment disputes need a clear policy and accurate product descriptions.',
    shipping: 'Buyers expect fast, tracked delivery and clear returns. Compare regional fulfillment, supplier processing time and landed shipping cost before you promise a delivery window.',
    tax: 'Sales tax, business registration and import rules depend on where you operate and where your customers live. Confirm nexus and collection requirements with a local tax professional.',
    channels: ['Meta ads', 'Google Shopping', 'TikTok', 'Email and SMS'],
    trust: 'fast shipping estimates, accessible support, reviews with context and a simple return policy'
  },
  latinAmerica: {
    label: 'Latin America and the Caribbean',
    payment: 'Local cards, installments, bank transfer, cash vouchers and wallets can matter more than a single international card option. Confirm which methods are available for your target country and test the full checkout flow.',
    shipping: 'Customs clearance and last-mile delivery can vary by city and carrier. Show realistic delivery ranges, track every order and prepare customers for any import charges that apply.',
    tax: 'Import taxes, VAT and registration thresholds vary across the region. Verify the current rules with a local accountant before you set prices or run promotions.',
    channels: ['Meta ads', 'TikTok', 'Google Shopping', 'Local marketplaces'],
    trust: 'local currency pricing, installment options, delivery clarity and Portuguese or Spanish support'
  },
  europe: {
    label: 'Europe',
    payment: 'Cards and digital wallets are common, but local payment preferences still matter. If you sell cross-border, confirm VAT, consumer rights and payment requirements before launch.',
    shipping: 'Customers expect tracked delivery and clear return windows. Cross-border shipping can be fast and predictable, or slow and expensive, depending on the carrier and destination.',
    tax: 'VAT, import rules and consumer protection requirements are stricter in many European markets. Confirm registration, collection and refund obligations with a local adviser.',
    channels: ['Google Shopping', 'Meta ads', 'TikTok', 'Email and SMS'],
    trust: 'local language, currency, privacy notices, delivery estimates and simple returns'
  },
  middleEast: {
    label: 'the Middle East',
    payment: 'Card payments, digital wallets and cash-on-delivery expectations vary by market. Confirm which methods your gateway can support and make the checkout work well on mobile.',
    shipping: 'Delivery to major cities is often faster than delivery to remote areas. Use tracked shipping, show realistic windows and make customs or import charges clear before checkout.',
    tax: 'Customs, VAT and business registration rules differ across the region. Confirm the current requirements with a local adviser before you import products or scale.',
    channels: ['Meta ads', 'TikTok', 'Google Search', 'Influencer partnerships'],
    trust: 'Arabic and English support where relevant, local currency, delivery clarity and visible contact details'
  },
  asia: {
    label: 'Asia',
    payment: 'Payment preferences are fragmented: cards, bank transfer, mobile wallets, cash-on-delivery and local installment options can all matter. Confirm the right mix for your target country before you build the checkout.',
    shipping: 'Delivery speed and cost vary widely between markets and even between cities. Use tracked suppliers, show realistic ranges and plan for customs where applicable.',
    tax: 'Import duty, VAT, GST and business registration rules vary by country. Verify the current requirements with a local accountant before you import stock or scale.',
    channels: ['Meta ads', 'TikTok', 'Google Search', 'Local marketplaces'],
    trust: 'mobile-first pages, local payment options, delivery clarity and local-language support'
  },
  oceania: {
    label: 'Oceania',
    payment: 'Cards are common, but wallets and local payment preferences can still affect conversion. Test the checkout with the methods your target customers actually use.',
    shipping: 'Wide geography makes shipping cost and delivery time a major conversion factor. Compare local and regional fulfillment before promising fast delivery.',
    tax: 'GST, import thresholds and business registration rules depend on the market. Confirm the current requirements with a local adviser before you scale.',
    channels: ['Google Shopping', 'Meta ads', 'TikTok', 'Email and SMS'],
    trust: 'transparent shipping costs, delivery estimates, local currency and easy returns'
  }
};

function profileFor(country){
  if(country.region === 'Africa') return PROFILES.africa;
  if(country.region === 'Europe') return PROFILES.europe;
  if(country.region === 'Oceania') return PROFILES.oceania;
  if(country.region === 'Americas'){
    return country.subregion === 'North America' ? PROFILES.northAmerica : PROFILES.latinAmerica;
  }
  if(country.region === 'Asia'){
    return country.subregion === 'Western Asia' ? PROFILES.middleEast : PROFILES.asia;
  }
  return PROFILES.asia;
}

const COLD_NICHES = [
  { title: 'Winter layers', text: 'Test insulated outerwear, thermal basics and accessories with a clear warmth benefit and a simple size guide.' },
  { title: 'Home heating support', text: 'Look at draft control, heated throws, radiator accessories and energy-saving comfort products.' },
  { title: 'Dry-weather skincare', text: 'Build a routine around barrier care, lip care and hydration rather than generic beauty claims.' },
  { title: 'Indoor fitness', text: 'Test compact equipment, recovery tools and home-workout accessories for buyers who train indoors.' },
  { title: 'Pet cold-weather gear', text: 'Focus on coats, paw protection and washable bedding with clear sizing by breed.' },
  { title: 'Car winter accessories', text: 'Test de-icing, visibility, cabin comfort and safety products with a strong demonstration angle.' },
  { title: 'Cozy home textiles', text: 'Bundle throws, socks, slippers and sleep accessories around a comfort-led offer.' },
  { title: 'Hair and scalp care', text: 'Test scalp tools, gentle brushes and moisture-focused routines with honest before-and-after context.' },
  { title: 'Kitchen comfort', text: 'Look for warm-drink, soup and meal-prep products that solve a real winter routine problem.' },
  { title: 'Travel winter gear', text: 'Packable layers, luggage accessories and cold-weather travel comfort can work as a seasonal bundle.' },
  { title: 'Sleep and recovery', text: 'Test sleep masks, weighted items, recovery tools and evening routines with realistic claims.' },
  { title: 'Winter safety and lighting', text: 'Visibility lights, reflective accessories and emergency car items suit a practical demonstration.' }
];

const HOT_NICHES = [
  { title: 'Portable cooling', text: 'Test neck fans, misting devices, cooling towels and desk fans with a visible, demonstrable benefit.' },
  { title: 'Lightweight apparel', text: 'Build around breathable fabrics, quick-dry pieces and easy-care basics for hot, humid days.' },
  { title: 'Sun and after-sun care', text: 'Focus on sun protection routines, after-sun care and lip care with accurate, non-medical claims.' },
  { title: 'Hydration gear', text: 'Test insulated bottles, electrolyte accessories and carry solutions for commuting and travel.' },
  { title: 'Home airflow', text: 'Look at airflow, shade, humidity and sleep-comfort products that are easy to demonstrate.' },
  { title: 'Outdoor entertaining', text: 'Test portable lighting, cooling, serving and picnic accessories for warm-weather gatherings.' },
  { title: 'Travel comfort', text: 'Neck pillows, packing organizers and cooling travel accessories can work as a focused bundle.' },
  { title: 'Device cooling', text: 'Phone and laptop cooling stands, airflow pads and cable organization suit mobile-heavy markets.' },
  { title: 'Fitness recovery', text: 'Test cooling towels, recovery tools and hydration accessories with realistic recovery claims.' },
  { title: 'Baby summer essentials', text: 'Focus on shade, lightweight clothing and travel comfort, with safety information stated clearly.' },
  { title: 'Insect protection', text: 'Test wearable and travel-friendly protection products where local demand and regulations support them.' },
  { title: 'Car cooling', text: 'Seat covers, sunshades, organizers and cabin cooling accessories solve a visible daily problem.' }
];

const TEMPERATE_NICHES = [
  { title: 'Home organization', text: 'Test storage, drawer organizers and space-saving products with a clear before-and-after demonstration.' },
  { title: 'Beauty tools', text: 'Focus on tools with a simple routine, honest claims and strong visual education.' },
  { title: 'Phone accessories', text: 'Cases, stands, charging and protection products can work when the offer is specific rather than generic.' },
  { title: 'Home fitness', text: 'Test compact equipment, recovery accessories and habit-building bundles for small spaces.' },
  { title: 'Pet supplies', text: 'Focus on grooming, walking, feeding and enrichment products with sizing and safety detail.' },
  { title: 'Kitchen gadgets', text: 'Look for prep, storage and cleaning tools that solve one clear problem in a short demo.' },
  { title: 'Car accessories', text: 'Test organization, cleaning, safety and comfort products for daily drivers.' },
  { title: 'Everyday jewelry', text: 'Build around gifting, layering and simple care instructions rather than unsupported material claims.' },
  { title: 'Travel accessories', text: 'Packing organizers, comfort items and tech pouches work well as a coordinated travel offer.' },
  { title: 'Baby and parenting helpers', text: 'Test practical feeding, sleep, travel and organization products with safety information up front.' },
  { title: 'Desk and work-from-home', text: 'Focus on posture, cable management, lighting and focus accessories for home offices.' },
  { title: 'Garden and balcony', text: 'Test compact tools, plant care and outdoor comfort products for small-space growers.' }
];

function nichesFor(country){
  const lat = Math.abs(Number(country.latlng && country.latlng[0]) || 0);
  const pool = lat >= 45 ? COLD_NICHES : lat > 20 ? TEMPERATE_NICHES : HOT_NICHES;
  return pick(pool, country.code + country.name, 6);
}

function channelsFor(country){
  const profile = profileFor(country);
  return pick(profile.channels.map(title => ({ title })), country.code + 'channels', 3).map(item => item.title);
}

const ARTICLE_COUNTRIES = new Set([
  'Bahamas', 'Central African Republic', 'Dominican Republic', 'Gambia', 'Marshall Islands',
  'Netherlands', 'Philippines', 'Solomon Islands', 'United Arab Emirates', 'United Kingdom', 'United States'
]);
function countryLabel(country, withArticle){
  if(!withArticle || !ARTICLE_COUNTRIES.has(country.name)) return country.name;
  return 'the ' + country.name;
}
function languageLine(country){
  const langs = Array.isArray(country.languages) ? country.languages.filter(Boolean) : [];
  if(!langs.length) return 'the main local language';
  const shown = langs.slice(0, 3);
  const joined = shown.length === 1 ? shown[0] : shown.slice(0, -1).join(', ') + ' and ' + shown[shown.length - 1];
  return langs.length > shown.length ? joined + ' (plus other local languages)' : joined;
}

function currencyLine(country){
  if(!country.currency) return 'the local currency';
  const symbol = country.currencySymbol ? ` (${country.currencySymbol})` : '';
  return `${country.currency} - ${country.currencyName || 'local currency'}${symbol}`;
}

function countryFaq(country){
  const c = countryLabel(country, true);
  const currency = country.currency || 'local currency';
  const language = languageLine(country);
  return [
    {
      q: `Is dropshipping legal in ${c}?`,
      a: `Dropshipping is generally treated as a retail business, but the legal requirements depend on how you register, where you store data and what you sell. Check business registration, consumer protection, tax, privacy and product rules for ${c} with a local professional before you launch.`
    },
    {
      q: `Do I need a registered business in ${c}?`,
      a: `Not always at the very beginning, but payment providers, suppliers and marketplaces may require one. The right answer depends on your sales volume, business model and the gateway you use. Confirm the current requirements for ${c} before you rely on a specific structure.`
    },
    {
      q: `What currency should my store display in ${c}?`,
      a: `Display ${currency} for local shoppers and show the final charge clearly before checkout. If you also accept USD, explain conversion and any fees so the customer is not surprised at payment.`
    },
    {
      q: `How long does shipping to ${c} take?`,
      a: `It depends on the supplier, warehouse and destination. Ask for written processing and delivery ranges, use tracked shipping where possible, and publish a realistic window instead of promising a date you cannot control.`
    },
    {
      q: `How much does it cost to start dropshipping in ${c}?`,
      a: `Budget for the store build, domain, platform subscription, apps, product samples, payment fees, shipping tests and an advertising test budget. Avoid any provider that promises a fixed result or hides the ongoing costs.`
    },
    {
      q: `Can Nexatech build a store for customers in ${c}?`,
      a: `Yes. Nexatech builds stores for clients worldwide, with the store language, currency, payment setup, shipping expectations and product pages adapted to the target market. Review the packages or start a private chat to discuss ${c}.`
    },
    {
      q: `Do I need to speak the local language to sell in ${c}?`,
      a: `Not always, but local-language product pages and support usually improve trust. The market's main language(s) are ${language}. Plan for translation or a local reviewer rather than relying on machine translation alone.`
    }
  ];
}

function siteNodes(siteUrl){
  return [
    {
      '@type': 'Organization',
      '@id': `${siteUrl}/#organization`,
      name: 'Nexatech Dropshipping Store',
      url: `${siteUrl}/`,
      logo: `${siteUrl}/og-image.png`
    },
    {
      '@type': 'WebSite',
      '@id': `${siteUrl}/#website`,
      url: `${siteUrl}/`,
      name: 'Nexatech Dropshipping Store',
      publisher: { '@id': `${siteUrl}/#organization` }
    }
  ];
}

function countryPageShell({ title, description, canonical, jsonLd, body, siteUrl, ogType = 'article' }){
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${esc(canonical)}">
<meta name="robots" content="index,follow,max-image-preview:large">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:type" content="${esc(ogType)}">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:image" content="${esc(siteUrl)}/og-image.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(description)}">
<meta name="twitter:image" content="${esc(siteUrl)}/og-image.png">
<link rel="icon" type="image/png" href="/favicon.png">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
<link rel="alternate" type="application/rss+xml" title="Nexatech Dropshipping Blog" href="/rss.xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=Space+Grotesk:wght@500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/css/pages.css">
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
</head>
<body class="nx-page">
<header class="nx-head"><div class="container nx-head-inner"><a class="nx-logo" href="/">NEXATECH</a><nav class="nx-nav"><a href="/">Home</a><a href="/pricing">Pricing</a><a href="/themes">Themes</a><a href="/faq">FAQ</a><a href="/blog" aria-current="page">Blog</a><a class="nx-cta" href="/messages">Start a Chat</a></nav></div></header>
<main class="nx-main">
${body}
</main>
<footer class="nx-foot"><div class="container nx-foot-inner"><span>&copy; <span id="year"></span> Nexatech Dropshipping Store. Serving clients worldwide.</span><span><a href="/privacy.html">Privacy</a> &middot; <a href="/terms.html">Terms</a> &middot; <a href="/blog/countries">Country guides</a> &middot; <a href="/rss.xml">RSS</a></span></div></footer>
<script>document.getElementById('year').textContent=new Date().getFullYear();</script>
</body>
</html>`;
}

export function getCountryGuide(slug){
  return COUNTRY_BY_SLUG.get(String(slug || '').toLowerCase()) || null;
}

export function renderCountryGuide(country, siteUrl){
  const c = country;
  const label = countryLabel(c, true);
  const name = esc(label);
  const profile = profileFor(c);
  const niches = nichesFor(c);
  const channels = channelsFor(c);
  const faq = countryFaq(c);
  const languages = esc(languageLine(c));
  const currency = esc(currencyLine(c));
  const currencyCode = esc(c.currency || 'local currency');
  const canonical = `${siteUrl}/blog/how-to-start-dropshipping-in-${c.slug}`;
  const title = `How to Start Dropshipping in ${label} (2026 Advanced Guide)`;
  const description = `Advanced dropshipping guide for ${label}: ${currencyCode} pricing, payments, suppliers, delivery, tax, SEO and a 10-step store launch process.`;
  const published = '2026-11-14';
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'BlogPosting',
        '@id': canonical + '#article',
        headline: `How to Start Dropshipping in ${label}`,
        description,
        datePublished: published,
        dateModified: published,
        author: { '@type': 'Organization', name: 'Nexatech' },
        publisher: { '@id': `${siteUrl}/#organization` },
        mainEntityOfPage: canonical,
        image: `${siteUrl}/og-image.png`,
        about: { '@type': 'Country', name: c.name },
        spatialCoverage: { '@type': 'Country', name: c.name },
        inLanguage: 'en'
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: `${siteUrl}/` },
          { '@type': 'ListItem', position: 2, name: 'Blog', item: `${siteUrl}/blog` },
          { '@type': 'ListItem', position: 3, name: 'Country guides', item: `${siteUrl}/blog/countries` },
          { '@type': 'ListItem', position: 4, name: c.name, item: canonical }
        ]
      },
      {
        '@type': 'FAQPage',
        mainEntity: faq.map(item => ({
          '@type': 'Question',
          name: item.q,
          acceptedAnswer: { '@type': 'Answer', text: item.a }
        }))
      },
      ...siteNodes(siteUrl)
    ]
  };

  const body = `<div class="container">
    <nav class="nx-breadcrumbs" aria-label="Breadcrumb"><a href="/">Home</a> / <a href="/blog">Blog</a> / <a href="/blog/countries">Country guides</a> / ${name}</nav>
    <div class="nx-post">
      <p class="nx-kicker">Dropshipping in ${name}</p>
      <h1 class="nx-h1">How to Start Dropshipping in ${name}: Advanced Store Setup Guide</h1>
      <p class="nx-lead">A practical, advanced guide to building a dropshipping store for customers in ${name}: offer validation, ${currencyCode} pricing, payment setup, supplier architecture, delivery expectations, tax checks, SEO and a 10-step launch process.</p>

      <div class="nx-card" style="margin-top:22px">
        <strong>Quick answer:</strong> start with one product category, validate demand with real buyers, price in ${currencyCode}, confirm payment and tax requirements, lock in a primary and backup supplier, and launch with tracked analytics. The goal is not a faster template; it is a store that can survive real customers, refunds and scale.
      </div>

      <h2 class="nx-h2">${name} market snapshot</h2>
      <table class="nx-table">
        <tr><th>Region</th><td>${esc(c.subregion || c.region || '')}${c.subregion && c.region ? ', ' : ''}${esc(c.region || '')}</td></tr>
        <tr><th>Capital</th><td>${esc(c.capital || 'Not listed')}</td></tr>
        <tr><th>Currency</th><td>${currency}</td></tr>
        <tr><th>Main language(s)</th><td>${languages}</td></tr>
        <tr><th>Best starting model</th><td>One niche, one primary supplier, one test channel, one clear delivery promise.</td></tr>
      </table>

      <h2 class="nx-h2">Why ${name} needs a country-specific store</h2>
      <p>Buyers in ${name} do not need another generic store. They need answers to local questions: what the price is in ${currencyCode}, how long delivery takes, which payment methods work, what happens if an item arrives damaged, and who they can contact. A country-specific build turns those questions into visible trust signals instead of leaving them to guesswork.</p>
      <p>The advanced advantage is not a more animated theme. It is a tighter operating system behind the store: a supplier map, a payment stack, a delivery promise you can keep, analytics that show contribution margin, and content that matches how people in ${name} actually search.</p>

      <h2 class="nx-h2">The advanced 10-step launch process</h2>
      <h3>1. Build a country-specific offer brief</h3>
      <p>Write down who you are selling to in ${name}, what problem the product solves, what the buyer currently uses instead, and why they would switch. Include the price in ${currencyCode}, the delivery expectation and the return condition. If the offer only makes sense with a vague promise, it is not ready.</p>
      <h3>2. Validate demand before you design</h3>
      <p>Review local marketplaces, competitor stores, social ads and community discussions. Map at least 20 competing offers, note their prices and shipping claims, and speak to potential buyers. You are looking for repeated complaints, expensive alternatives and clear buying intent, not just a product you personally like.</p>
      <h3>3. Choose products with a landed-cost ceiling</h3>
      <p>Calculate product cost, shipping, packaging, payment fees, expected refunds and advertising cost before you choose a hero product. A product with a low sticker price can still be a bad offer if it is expensive to ship, easy to break or hard to explain in a short video.</p>
      <h3>4. Design a primary and backup supplier map</h3>
      <p>For every hero product, confirm at least one primary and one backup supplier. Get written processing times, tracking availability, packaging details, stock reliability and the returns address. Test a sample order yourself and document the real timeline before you publish a delivery promise in ${name}.</p>
      <h3>5. Build the payment and currency stack</h3>
      <p>${profile.payment} Display ${currencyCode} clearly, explain any conversion, and test a low-value transaction with a local card and a cross-border card where relevant. Keep a backup payment option ready before you spend money on traffic.</p>
      <h3>6. Localize the store for trust</h3>
      <p>Use ${languages} where it improves clarity, show prices in ${currencyCode}, and make delivery, returns and support easy to find. Add ${profile.trust}. Localization is not a flag icon; it is the removal of small doubts that stop a buyer at checkout.</p>
      <h3>7. Instrument analytics and unit economics</h3>
      <p>Track page views, add-to-carts, checkout starts, purchases and refunds with consistent UTM tags. Connect your ad platforms and, where possible, server-side events. Calculate contribution margin as average order value minus product cost, shipping, payment fees, refund allowance and ad cost. Scale only when the unit economics work.</p>
      <h3>8. Build a country SEO cluster</h3>
      <p>Create useful pages around country intent: how to start dropshipping in ${name}, product selection for ${name}, payment questions, supplier questions and delivery expectations. Link those pages to your product collections and to this guide. Avoid publishing thin pages that repeat the same keyword with no new information.</p>
      <h3>9. Launch paid traffic with a testing budget</h3>
      <p>Start with one channel and a defined test budget. ${channels.join(', ')} can all work, but each needs different creative and landing pages. Test multiple hooks, not multiple random products. Kill weak angles quickly, keep the learning, and do not scale until the offer has a repeatable conversion path.</p>
      <h3>10. Run a 14-day QA and scaling loop</h3>
      <p>After launch, review checkout errors, support questions, delivery delays, refund reasons and ad performance every day. Fix the biggest leak first. A store that converts at a modest rate with healthy margins is a better base for scaling than a store with a high top-of-funnel but a broken checkout.</p>

      <h2 class="nx-h2">Product angles to test in ${name}</h2>
      <p>These are starting angles, not guarantees. Validate demand, landed cost and supplier reliability before you commit to a full product launch.</p>
      <div class="nx-grid nx-grid-3">
        ${niches.map(item => `<article class="nx-card"><span class="nx-tag">Test angle</span><h3 class="nx-h3">${esc(item.title)}</h3><p class="nx-muted">${esc(item.text)}</p></article>`).join('\n        ')}
      </div>

      <h2 class="nx-h2">Payment, currency and tax setup for ${name}</h2>
      <p>${profile.payment}</p>
      <p>Display ${currencyCode} as the primary storefront currency. If you accept USD or another currency, show the converted total before the customer confirms payment and explain who pays any conversion fee. Test refunds and failed payments, not just successful purchases.</p>
      <p>${profile.tax}</p>

      <h2 class="nx-h2">Supplier and delivery model</h2>
      <p>${profile.shipping}</p>
      <p>For ${name}, map delivery by destination type: major city, secondary city and remote area. Publish a range, not a single optimistic date. If a supplier cannot provide tracking, either find a better supplier or state the limitation before checkout. A clear expectation prevents more support tickets than a fast-sounding promise creates.</p>

      <h2 class="nx-h2">Country SEO plan for ${name}</h2>
      <p>Build a small cluster instead of one oversized article. Useful page ideas include:</p>
      <ul class="nx-list">
        <li>How to start dropshipping in ${name}</li>
        <li>Best product categories to test in ${name}</li>
        <li>Payment methods and checkout expectations in ${name}</li>
        <li>Dropshipping suppliers and delivery options for ${name}</li>
        <li>Online store setup cost and timeline in ${name}</li>
        <li>Local SEO and paid traffic checklist for ${name}</li>
      </ul>
      <p>Use natural language, answer the question in the first paragraph, add internal links to related guides, and keep every page in the sitemap. A country page should be useful even if the reader never buys from Nexatech.</p>

      <h2 class="nx-h2">Paid traffic plan</h2>
      <p>For ${name}, start with ${channels.join(', ')}. Use one primary channel until you have enough data to judge the offer. Create three distinct hooks: a problem-first hook, a demonstration hook and a social-proof angle only if you have real proof. Send traffic to a page that matches the ad promise, not a generic home page.</p>

      <h2 class="nx-h2">Launch checklist for ${name}</h2>
      <ul class="nx-list">
        <li>Choose one primary product category and one backup category.</li>
        <li>Confirm business registration, tax and import rules for ${name} with a local professional.</li>
        <li>Get written supplier processing times, tracking and returns terms.</li>
        <li>Test a sample order and record the real delivery timeline.</li>
        <li>Set shipping zones and rates before publishing the store.</li>
        <li>Configure payment methods and test a live transaction.</li>
        <li>Write clear shipping, refund, privacy and terms pages.</li>
        <li>Install analytics, consent tools and conversion tracking.</li>
        <li>Add local trust signals: ${profile.trust}.</li>
        <li>Prepare three ad hooks and a landing page for each promise.</li>
        <li>Set a test budget and a stop-loss before you launch.</li>
        <li>Review checkout errors and support questions daily for the first two weeks.</li>
      </ul>

      <h2 class="nx-h2">Common mistakes to avoid in ${name}</h2>
      <ul class="nx-list">
        <li>Copying another country's shipping promise without testing local delivery.</li>
        <li>Showing only USD or a foreign currency with no clear local conversion.</li>
        <li>Relying on one supplier with no backup for the hero product.</li>
        <li>Launching with thin product pages and copied supplier descriptions.</li>
        <li>Ignoring local tax, import or consumer-protection rules.</li>
        <li>Scaling ads before contribution margin is positive.</li>
      </ul>

      <h2 class="nx-h2">Frequently asked questions about dropshipping in ${name}</h2>
      <div class="nx-faq">
        ${faq.map(item => `<details><summary>${esc(item.q)}</summary><div class="nx-answer">${esc(item.a)}</div></details>`).join('\n        ')}
      </div>

      <h2 class="nx-h2">Next step</h2>
      <p>If you want a store built around a specific country instead of a generic template, compare the <a href="/pricing">packages</a>, browse <a href="/themes">ready-made themes</a>, or <a href="/messages">start a private chat</a>. You can also read the <a href="/blog/countries">full country guide index</a> or the <a href="/faq">setup FAQ</a>.</p>
      <p><a class="nx-btn" href="/pricing">View Pricing &amp; Order</a> <a class="nx-btn-ghost" href="/messages">Start a Chat</a></p>
      <p class="nx-muted" style="font-size:12px">This guide is educational. Payment, tax, import and consumer rules change. Verify the current requirements for ${name} with local professionals before you launch or scale.</p>
    </div>
  </div>`;

  return countryPageShell({ title, description, canonical, jsonLd, body, siteUrl });
}

export function renderCountryHub(siteUrl){
  const groups = new Map();
  for(const c of COUNTRY_GUIDES){
    const key = c.region || 'Other';
    if(!groups.has(key)) groups.set(key, []);
    groups.get(key).push(c);
  }
  const regionOrder = ['Africa', 'Americas', 'Asia', 'Europe', 'Oceania', 'Other'];
  const sections = regionOrder.filter(region => groups.has(region)).map(region => {
    const countries = groups.get(region).slice().sort((a, b) => a.name.localeCompare(b.name));
    return `<h2 class="nx-h2">Dropshipping in ${esc(region)}</h2>
      <div class="country-index">
        ${countries.map(c => `<a href="/blog/how-to-start-dropshipping-in-${c.slug}">${esc(c.name)}<span>${esc(c.currency || '')}</span></a>`).join('\n        ')}
      </div>`;
  }).join('\n      ');
  const canonical = `${siteUrl}/blog/countries`;
  const title = `Dropshipping Country Guides: ${COUNTRY_GUIDE_COUNT} Advanced Store Setup Guides`;
  const description = `Browse ${COUNTRY_GUIDE_COUNT} advanced dropshipping country guides covering local currency, payments, suppliers, delivery, tax checks, SEO and launch steps.`;
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'CollectionPage',
        '@id': canonical + '#webpage',
        url: canonical,
        name: title,
        description,
        isPartOf: { '@id': `${siteUrl}/#website` },
        mainEntity: { '@id': canonical + '#list' },
        inLanguage: 'en'
      },
      {
        '@type': 'ItemList',
        '@id': canonical + '#list',
        name: title,
        numberOfItems: COUNTRY_GUIDE_COUNT,
        itemListElement: COUNTRY_GUIDES.map((c, index) => ({
          '@type': 'ListItem',
          position: index + 1,
          url: `${siteUrl}/blog/how-to-start-dropshipping-in-${c.slug}`,
          name: c.name
        }))
      },
      {
        '@type': 'BreadcrumbList',
        itemListElement: [
          { '@type': 'ListItem', position: 1, name: 'Home', item: `${siteUrl}/` },
          { '@type': 'ListItem', position: 2, name: 'Blog', item: `${siteUrl}/blog` },
          { '@type': 'ListItem', position: 3, name: 'Country guides', item: canonical }
        ]
      },
      ...siteNodes(siteUrl)
    ]
  };
  const body = `<div class="container">
    <nav class="nx-breadcrumbs" aria-label="Breadcrumb"><a href="/">Home</a> / <a href="/blog">Blog</a> / Country guides</nav>
    <div class="nx-post">
      <p class="nx-kicker">Dropshipping by Country</p>
      <h1 class="nx-h1">Dropshipping Country Guides</h1>
      <p class="nx-lead">Choose a country for an advanced store setup guide covering local currency, payment expectations, supplier architecture, delivery, tax checks, SEO and launch steps. ${COUNTRY_GUIDE_COUNT} countries, one practical framework.</p>
      <div class="nx-card" style="margin-top:22px"><strong>Start here:</strong> pick your target market, read the country guide, then compare the <a href="/pricing">store packages</a> or <a href="/messages">ask a question</a>. Country guides are educational; confirm local rules with a professional before launch.</div>
      ${sections}
      <h2 class="nx-h2">Build for your target market</h2>
      <p>If you want a store built for a specific country, compare the <a href="/pricing">done-for-you packages</a> or browse <a href="/themes">ready-made themes</a>. You can also read the <a href="/blog">general dropshipping blog</a> and the <a href="/faq">setup FAQ</a>.</p>
      <p><a class="nx-btn" href="/pricing">View Pricing &amp; Order</a> <a class="nx-btn-ghost" href="/messages">Start a Chat</a></p>
    </div>
  </div>`;
  return countryPageShell({ title, description, canonical, jsonLd, body, siteUrl, ogType: 'website' });
}

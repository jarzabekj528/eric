# Say When Contracting static website

This site keeps the existing static HTML + Cloudflare Pages Functions architecture. No client framework, database migration, or hosting migration is needed.

## Editing and building

- Edit each page's HTML directly. Keep metadata, visible FAQs, and its JSON-LD graph aligned when changing business information or answers.
- Edit shared styles in `assets/site.css` and behavior in `assets/site.js`.
- Run `npm ci`, `npm run build`, and `npm run check`.
- The build minifies CSS/JavaScript, updates content-hashed references, and prepares **dist/** using a public-file allowlist. Source, node_modules, credentials, and build scripts are excluded.
- For a local static preview: `python3 -m http.server 8766 --directory dist`. The estimate API requires the Cloudflare Pages runtime; a plain static server cannot submit leads.

## Existing Cloudflare Pages deployment

Set the build command to `npm run build` and the output directory to `dist`. Keep `functions/api/lead.js` in the project root so Pages discovers it. Preserve the existing GoHighLevel environment bindings; see the comments in that function for variable names. Never include `.dev.vars` in uploaded assets.

Retain the existing apex-to-www redirect. Cloudflare Pages already normalizes `index.html` and extensionless HTML URLs. Do not add blanket slash redirects that conflict with that behavior. The thank-you canonical follows the verified `/thank-you` route and remains noindex.

After deployment, verify successful lead submission and booking, HTTP status codes, the sitemap, structured data in Google's Rich Results Test, and rendered URLs in Search Console. Initial local form checks use mocked API responses and do not contact real customers or create CRM leads.

## Content safeguards

The eight service pages describe the user's requested services within the existing interior remodeling scope. Confirm exact cabinet sourcing, tile/flooring offerings, project eligibility, business hours, existing license/insurance claims, financing, experience, and warranty terms with the owner. Do not add a street address, credential number, rating, price, guarantee, project date, or neighborhood claim without evidence.

Lima is targeted by the homepage and service pages. Other coverage is consolidated in `/service-areas/`; `/projects/st-marys-walk-in-shower/` uses existing local project photos. Create additional city pages when real local projects, photos, testimonials, or meaningful service differences make each page useful.

GeneralContractor is a Schema.org subtype of LocalBusiness and Organization. FAQ markup is retained for visible answers, but Google discontinued FAQ rich results in May 2026. No self-serving Review or AggregateRating markup is added. The existing partial address does not establish eligibility for Google's LocalBusiness rich results.

Core Web Vitals must be verified with real visitor data after publication. Lighthouse is a lab diagnostic; its Total Blocking Time is not a measurement of field Interaction to Next Paint.

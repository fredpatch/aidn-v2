/** BRAND-AIDN-OMA-1 - the visible product identity (presentation only; the
 *  technical names - packages, routes, cookies, JWT audience, env - stay
 *  « aidn »). Visible separators use the hyphen « - » (never the em dash). */

/** Short product name, shown wherever the application names itself. */
export const PRODUCT_NAME = 'AIDN - OMA';

/** Full institutional line (admin login / bootstrap, reports, emails). */
export const PRODUCT_SUBTITLE = 'Service OMA · Direction de la Navigabilité · ANAC Gabon';

/** Compact institutional line for the admin top bar. */
export const PRODUCT_SERVICE_LINE = 'Service OMA · Direction de la Navigabilité';

/** Applicant portal descriptor (login, header). */
export const PORTAL_PRODUCT_SUBTITLE = 'Portail postulant OMA · ANAC Gabon';

/** Browser tab titles (kept in sync with the apps' index.html by tests). */
export const ADMIN_DOCUMENT_TITLE = `${PRODUCT_NAME} | Administration`;
export const PORTAL_DOCUMENT_TITLE = `${PRODUCT_NAME} | Portail postulant`;

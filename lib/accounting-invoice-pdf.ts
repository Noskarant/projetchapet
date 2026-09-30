import { buildBusinessDocumentPdf } from './mobile-document-pdf';
import { invoiceToMobile, customerToMobile } from './mobile-desktop-sync';
import { normalizeCompanyProfile } from './company-profile';
import type { Invoice } from './project-chapet';
export async function accountingInvoicePdf(invoice: Invoice, companyProfile: unknown) {
 const profile=normalizeCompanyProfile(companyProfile);
 const blob=await buildBusinessDocumentPdf({document:invoiceToMobile(invoice),customer:customerToMobile(invoice.customer),profile,company:{legalName:profile.legalName,displayName:profile.displayName,siret:profile.siret,vat:profile.vatNumber,email:profile.email,phone:profile.phone,address:profile.address,postalCode:profile.postalCode,city:profile.city,paymentTerms:'Paiement à échéance indiquée'}});
 return Buffer.from(await blob.arrayBuffer());
}

import { makeId, type MobileCustomer, type MobileQuote } from './mobile-prototype';
import type { CommercialDemoState, CommercialProject } from './mobile-commercial-demo';
import type { WorkspaceAliases } from './mobile-desktop-sync';

export function remapQuotePhotoProjects(state: CommercialDemoState, aliases: WorkspaceAliases): CommercialDemoState {
  const projects = state.projects.map(project => ({
    ...project,
    customerId: aliases.customers.get(project.customerId) ?? project.customerId,
    quoteId: project.quoteId ? aliases.quotes.get(project.quoteId) ?? project.quoteId : project.quoteId,
  }));
  return { ...state, projects };
}

export function projectsForQuote(state: CommercialDemoState, quoteId: string) {
  return state.projects.filter(project => project.quoteId === quoteId);
}
export function ensureQuotePhotoProject(state:CommercialDemoState,quote:MobileQuote,customer:MobileCustomer|null){
 const existing=projectsForQuote(state,quote.id)[0];if(existing)return {state,project:existing};
 const project:CommercialProject={id:makeId('project'),name:quote.title||`Dossier ${quote.number}`,subtitle:quote.number,customerId:quote.customerId,quoteId:quote.id,
  address:[customer?.address,customer?.postalCode,customer?.city].filter(Boolean).join(', '),status:'À planifier',startDate:'',nextVisit:'',teamIds:[],steps:[],issues:[],photos:[]};
 return {state:{...state,projects:[...state.projects,project]},project};
}
/** An explicit quote relation prevents photos from another job for the same client leaking into the email. */
export function quotePhotoDossier(state:CommercialDemoState,quote:MobileQuote,photoIds?:string[]){
 const projects=projectsForQuote(state,quote.id);
 const all=projects.flatMap(project=>project.photos.map(photo=>({...photo,caption:[project.name,photo.caption].filter(Boolean).join(' · ')})));
 const photos=photoIds===undefined?all:all.filter(photo=>photoIds.includes(photo.id));
 if(photoIds?.some(id=>!all.some(photo=>photo.id===id)))throw new Error('Une photo sélectionnée est indisponible. Vérifiez le dossier avant l’envoi.');
 if(!photos.length)return null;
 return {...projects[0],name:`Dossier photos · ${quote.number} · ${quote.title}`,photos};
}

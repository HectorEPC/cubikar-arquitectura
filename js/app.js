import {
  renderCalendarioObra,
  setCalendarioViewMode,
  setCalendarioTimeScale,
  filterCalendarioPartida,
  changeProjectStartDate,
  onGanttDateInput,
  onGanttDurationInput,
  onFinancialCellEdit,
  triggerAutoDistributeSchedule,
  exportCurrentScheduleExcel,
  printCalendarioObra,
  toggleCalendarioNodeGroup,
  expandAllCalendarioGroups,
  collapseAllCalendarioGroups,
  toggleCalendarioJustifyText,
  changeGanttZoom,
  initGanttResizer,
  syncGanttScroll,
  initGanttBarDrag,
  initPremiereZoomBar,
  updatePremiereZoomBarUI,
  scrollGanttTimelineStep,
  fitGanttTimelineEntireProject,
  changeGanttTodayDateAction,
  resetGanttTodayDateAction,
  initGanttTodayLineDrag,
  openCalendarioJornadaModal,
  closeCalendarioJornadaModal,
  switchCalendarioJornadaTab,
  renderCalendarioJornadaModal,
  toggleNonWorkingDayOfWeek,
  setNonWorkingDaysPreset,
  addFestivoFromModal,
  removeFestivoFromModal,
  loadMexicanHolidaysToModal,
  addLluviaFromModal,
  removeLluviaFromModal,
  saveCalendarioJornadaModal,
  toggleCalendarioCriticalPath,
  toggleCalendarioLinkMode,
  handleCalendarioBarLinkClick,
  undoCalendarioScheduleAction,
  redoCalendarioScheduleAction,
  onGanttPredecessorSelect,
  clearAllCalendarioLinksAction,
  openConceptDependenciesModal,
  closeConceptDependenciesModal,
  clearConceptDependenciesFromModal,
  saveConceptDependenciesModal,
  openCalendarioAiModal,
  closeCalendarioAiModal,
  refreshCalendarioAiPreview,
  runCalendarioGeminiAiProposal,
  applyCalendarioAiProposal,
  selectCalendarioRow
} from './modules/calendario/calendarioView.js?v=20261116_cf19';
import {
  renderPresupuestoView,
  togglePresupuestoSelectNode,
  togglePresupuestoSelectAll,
  togglePresupuestoSubtituloExpand,
  agruparPresupuestoConceptos,
  desagruparPresupuestoConceptos
} from './modules/presupuesto/presupuestoView.js?v=20261116_cf19';
import { getProjectPresupuestoConfig } from './modules/presupuesto/presupuestoModel.js?v=20261116_cf19';
import { renderSeguimientoView } from './modules/seguimiento/seguimientoView.js?v=20261116_cf19';
import { initStore, state, syncClipboardFromStorage } from './state/store.js?v=20261116_cf19';
import { STORAGE_KEY_CLIPBOARD, getActiveProjectId } from './config/constants.js?v=20261116_cf19';
import { undoAction, redoAction, updateUndoRedoButtons, setHistoryRenderCallback } from './state/history.js?v=20261116_cf19';
import { showToast } from './ui/notifications.js?v=20261116_cf19';
import { formatMoney, formatQty } from './core/formatters.js?v=20261116_cf19';
import { updateSobrecostoBadge, updateGrandTotal, calculateProrrateoCascade } from './core/calculations.js?v=20261116_cf19';
import { subscribeToProjectRealtime, unsubscribeFromProjectRealtime, initGlobalRealtimeSync, requestPeerSync } from './core/realtimeSync.js?v=20261116_cf19';
import { initAuthListener, hasPendingIncomingSsoSession, hydrateIncomingSsoSession, isSsoHydrationPending, syncLocalUserSession, hasOversizedLocalJwt, ensureCompactAuthSession } from './core/authService.js?v=20261116_cf19';
import { getCurrentUser } from './modules/portal/projectService.js?v=20261116_cf19';
import { initAppSwitcher } from './ui/appSwitcher.js?v=20261116_cf19';

import {
  findNodeById,
  recalculateClaves,
  addRootRow,
  addChildRow,
  duplicarNode,
  duplicarSelectedRow,
  copiarNode,
  copiarSelectedRow,
  pegarNode,
  pegarSelectedRow,
  limpiarPortapapeles,
  updateClipboardUI,
  getClipboardData,
  moverNode,
  moverSelectedRow,
  deleteNode,
  deleteSelectedRow,
  updateNode,
  toggleExpand,
  collapseAllCatalogNodes,
  expandAllCatalogNodes,
  agruparCatalogoConceptos,
  desagruparCatalogoConceptos,
  updateNodeColor,
  clearNodeColor,
  autoAssignCatalogColors,
  repartirEquitativamente,
  toggleSelectNode,
  toggleSelectAll
} from './modules/catalog/treeService.js?v=20261116_cf19';

import {
  openImportConceptsModal,
  closeImportConceptsModal,
  onSelectSourceProject,
  onSearchSourceConcepts,
  toggleConceptSelection,
  selectAllSourceConcepts,
  toggleMatrixPreviewAccordion,
  quickCopyPasteSingleConcept,
  importSelectedConceptsToCurrentProject
} from './modules/catalog/importFromProjectModal.js?v=20261116_cf19';

import { renderTAB1, selectRow, highlightCatalogRowInPlace, closeApuPanel, toggleDropdownMenu, closeAllDropdownMenus } from './modules/catalog/catalogView.js?v=20261116_cf19';

import {
  switchSidePanelTab,
  getActiveSidePanelTab,
  renderCotizacionesSidePanel,
  openCotizacionModal,
  closeCotizacionModal,
  saveCotizacionForm,
  updateCotizacionModalCostoPreview,
  handleModalFileInputChange,
  handleCardDirectFileUpload,
  viewCotizacionPdf
} from './modules/proveedores/proveedoresView.js?v=20261116_cf19';

import {
  cleanPhoneForWhatsApp,
  getCotizaciones,
  addCotizacion,
  updateCotizacion,
  deleteCotizacion,
  setCotizacionGanadora,
  unsetCotizacionGanadora
} from './modules/proveedores/cotizacionesService.js?v=20261116_cf19';

import {
  renderInsumosGenerales,
  filterInsumosGeneralesTable,
  toggleSelectAllInsumos,
  updateCostoUnitarioGeneral,
  combinarInsumosSeleccionados,
  openCombinarModal,
  closeCombinarModal,
  selectCombinarTarget,
  ejecutarCombinacionInsumos,
  filterInsumosCategoryView,
  toggleInsumoCard,
  agruparInsumosBase,
  desagruparInsumosBase,
  collapseAllInsumosCategories,
  expandAllInsumosCategories,
  actualizarCostoIndividualConIA,
  actualizarCostosConIASeleccionados,
  actualizarTodosLosInsumosSeleccionadosConIA,
  selectInsumoBaseRow
} from './modules/insumosGenerales/insumosView.js?v=20261116_cf19';

import {
  exportData,
  importData,
  openExportModal,
  closeExportModal,
  exportCatalogExcel,
  exportCatalogOpusZip,
  exportCatalogNeodataZip,
  exportCatalogOpus,
  exportCatalogNeodata,
  exportCatalogCsv
} from './modules/io/csvHandler.js?v=20261116_cf19';
import { initPanelResizer } from './ui/resizer.js?v=20261116_cf19';

import {
  openImportModal,
  closeImportModal,
  handleUniversalFileSelect,
  onSheetSelectChange,
  executeImport,
  toggleImportDestination,
  resetImportModalUI,
  onZoneSelectChange,
  calculateParsedBudgetTotal,
  loadCasaLauraOpusDirectly
} from './modules/io/universalImporter.js?v=20261116_cf19';

import {
  printTab1Catalog,
  printTab1CatalogWithCotizaciones,
  openCatalogPrintModal,
  closeCatalogPrintModal,
  printConceptoCotizaciones,
  printInsumosGenerales,
  printCalendarioObraFormat,
  printEstimacionesFormat
} from './modules/io/printService.js?v=20261116_cf19';

import {
  openMasterCatalogModal,
  closeMasterCatalogModal,
  onMasterCatalogSearchInput,
  triggerMasterCatalogSearch,
  insertConceptIntoBudget,
  switchMasterCatalogTab,
  handleDeleteCatalog,
  refreshMasterCatalogList
} from './modules/reference/masterCatalogModal.js?v=20261116_cf19';

import { installPresetCatalog, installAllPresets } from './modules/reference/presetCatalogs.js?v=20261116_cf19';

import { openReferenceDb } from './modules/reference/referenceDb.js?v=20261116_cf19';

import {
  openSettingsModal,
  closeSettingsModal,
  switchSettingsTab,
  toggleSettingsAdvancedSection,
  toggleAdvancedBlock,
  onSimpleGastosInput,
  onBreakdownGastosInput,
  updateCalculatedFactorPreview,
  updateFasarPreview,
  setSettingsPreset,
  saveSettings,
  onCurrencySelectChange,
  updateCurrencyPreview,
  toggleApiKeyVisibility,
  resetToDemoData,
  clearAllData,
  switchTab,
  closeAdminDualLoginModal,
  closeComparisonModal,
  initUniversalModalBackdrop,
  openPlatformInfoModal,
  closePlatformInfoModal,
  handlePlatformInfoEmpiezaGratis,
  handlePlatformInfoVerPlanes
} from './ui/modalController.js?v=20261116_cf19';

import {
  openTutorialHubModal,
  closeTutorialHubModal,
  launchTourFromHub,
  launchVideoFromHub,
  resetTourPreferencesFromHub
} from './ui/tutorialHubModal.js?v=20261116_cf19';

import {
  startInteractiveTour,
  skipInteractiveTour,
  closeInteractiveTour,
  checkAndResumeTourOnLoad
} from './ui/interactiveTour.js?v=20261116_cf19';

import {
  openVideoSimulatorModal,
  closeVideoSimulatorModal,
  toggleVoiceNarration
} from './ui/videoSimulatorModal.js?v=20261116_cf19';

import {
  openFirmasResponsablesModal,
  closeFirmasResponsablesModal,
  addFirmaSlotAction,
  removeFirmaSlotAction,
  toggleFirmaSlotAction,
  updateFirmaSlotField,
  resetFirmasToDefaultAction,
  saveFirmasModalAction,
  previewPrintWithFirmasAction,
  quickAssignPersonToFirstEmptySlot,
  getFirmasPrintHtml
} from './ui/firmasController.js?v=20261116_cf19';

import {
  initBranding,
  updateCompanyName,
  syncCompanyName,
  updateProjectName,
  syncProjectName,
  updateProjectLocation,
  syncProjectLocation,
  updateCompanySubtitle,
  triggerCompanyLogoUpload,
  handleCompanyLogoUpload,
  removeCompanyLogo,
  openCurrentLogoAdjuster,
  closeLogoAdjusterModal,
  setLogoZoom,
  adjustLogoZoom,
  resetLogoPosition,
  setLogoBgMode,
  applyAdjustedLogo
} from './ui/brandingController.js?v=20261116_cf19';

import {
  STORAGE_KEY_THEME,
  initThemeMode,
  toggleThemeMode,
  applyThemeMode,
  isNightMode,
  setThemeRenderCallback
} from './ui/themeController.js?v=20261116_cf19';

import {
  isTabLocked,
  setTabLocked,
  toggleTabLock,
  guardTabUnlocked,
  applyTabLocksToDOM,
  setTabLockRenderCallback
} from './ui/tabLockController.js?v=20261116_cf19';
import { hydrateProjectModulesFromCloud } from './core/cloudModulesSyncService.js?v=20261116_cf19';

import {
  setProjectChatDivision,
  syncProjectChatDivisionWithTab,
  onProjectChatEntryTypeChange,
  onProjectChatSearchInput,
  clearProjectChatSearch,
  toggleMoveChatMessageMenu,
  moveProjectChatMessageDivision,
  openProjectChatPrintModal,
  closeProjectChatPrintModal,
  confirmProjectChatPrintFromModal,
  onPrintModalScopeChange,
  toggleProjectChatDock,
  toggleProjectChatMaximize,
  printProjectChatReport,
  openProjectChatForPartida,
  clearProjectChatPartidaFilter,
  setProjectChatFilter,
  onProjectChatAuthorChange,
  toggleProjectChatTagPicker,
  addProjectChatPendingTag,
  removeProjectChatPendingTag,
  sendProjectChatMessage,
  deleteProjectChatMessage,
  jumpToProjectChatTag,
  renderProjectChatDock,
  setProjectChatRefreshCallback,
  toggleMentionNotificationsPopover,
  closeMentionNotificationsPopover,
  onNotificationsUserFilterChange,
  markAllMentionsAsRead,
  openMentionNotification,
  renderSidebarNotificationsUI,
  handleAcceptInvitationAction,
  handleRejectInvitationAction,
  loadProjectChatMessages,
  resetDefaultProjectChatWithFeedback,
  generateSeedProjectChatMessages
} from './modules/chat/projectChat.js?v=20261116_cf19';

import {
  initPortal,
  showPortalView,
  renderPortalAuth,
  updatePortalHeaderUserArea,
  updateWorkspaceHeaderUser,
  switchAuthTab,
  setRegSexo,
  handleCustomPhotoUpload,
  handleRegisterSubmit,
  handleLoginSubmit,
  quickLoginWithFeaturedUser,
  removeFeaturedUserAccount,
  quickLoginWithSavedUser,
  removeSavedUserQuickProfile,
  purgeAllUsersAndAccountsAction,
  togglePasswordVisibility,
  checkPasswordMatchLive,
  triggerGoogleSignIn,
  closeGoogleAuthModal,
  selectGoogleAccount,
  submitCustomGoogleAccount,
  renderPortalDashboard,
  filterProjectCards,
  onProjectSearchInput,
  setCompanyFilter,
  setTipoObraFilter,
  setProjectScopeFilter,
  setProjectDashboardMode,
  toggleSortDate,
  toggleSortAZ,
  resetProjectFilters,
  refreshProjectsGridUI,
  renderCompanyOptionsHTML,
  openProjectInWorkspace,
  openProjectInNewTab,
  goToProjectsDashboard,
  duplicateProjectAction,
  deleteProjectAction,
  syncProjectToCloudAction,
  openNuevoProyectoModal,
  openNewProjectModal,
  closeNuevoProyectoModal,
  goToWizardStep,
  handleWizardLogoFile,
  setSampleLogo,
  clearWizardLogo,
  onWizardCurrencyChange,
  updateWizardFactorPreview,
  updateTemplateSelection,
  finalizeCreateProject,
  openProfileModal,
  closeProfileModal,
  onProfileEditSexoChange,
  selectProfileAvatar,
  handleProfilePhotoUpload,
  saveProfileChanges,
  deleteUserAccount,
  deleteCurrentUserAccountAction,
  logoutUser,
  logoutAllDevices,
  toggleUserDropdown,
  closeUserDropdown,
  togglePortalUserDropdown,
  closePortalUserDropdown,
  renderMemberAvatarsHTML,
  openInviteModal,
  closeInviteModal,
  switchInviteModalTab,
  setInviteTabCheckboxes,
  toggleMemberTabPermission,
  setMemberAllTabsPermission,
  setInviteSexo,
  handleInvitePhotoUpload,
  selectInvitePreset,
  submitInviteMember,
  changeMemberRole,
  removeMemberFromProject,
  getActiveOrFallbackProjectId,
  copyProjectInviteLink,
  renderHeaderCollaborators,
  openPlanInviteModal,
  closePlanInviteModal,
  switchPlanInviteModalTab,
  setPlanInviteSexo,
  updatePlanInviteAvatarPreview,
  handlePlanInvitePhotoUpload,
  selectPlanInvitePreset,
  submitPlanInviteMember,
  changePlanCollaboratorRole,
  onRemovePlanCollaboratorClick,
  copyPlanInviteLink,
  TAB_METADATA,
  canCurrentUserAccessTab,
  updateNavigationTabsAccess,
  renderTabAssignedAvatars,
  renderAllTabAssignedMembers,
  openTabMembersAssignModal,
  closeTabMembersAssignModal,
  renderTabMembersModalList,
  onTabMemberCheckChange,
  toggleSelectAllTabMembers,
  saveTabMembersAssignment,
  simulateUserView,
  toggleComparisonModal,
  switchPortalView,
  switchView,
  toggleCardMenu,
  filterProjects,
  toggleSort,
  setStatusFilter,
  resetFilters,
  exportProjectToExcelAction
} from './modules/portal/portalController.js?v=20261116_cf19';

import {
  openCubikarAdminModal,
  closeCubikarAdminModal,
  renderCubikarAdminTable,
  openCoAdminsModal,
  closeCoAdminsModal,
  openMarketRatesModal,
  closeMarketRatesModal,
  saveMarketRatesFromModal,
  exportCubikarDatabaseToExcel,
  setAdminTableSearch,
  setAdminFilterActivity,
  setAdminFilterPlan,
  setAdminFilterCycle,
  isUserAdmin,
  isUserMasterAdmin,
  showAdminDualLoginModal
} from './modules/admin/cubikarAdmin.js?v=20261116_cf19';
import {
  openSubscriptionModal,
  closeSubscriptionModal,
  setSubscriptionBillingCycle,
  selectSubscriptionPlan,
  renderSubscriptionCards,
  updateSubscriptionBadgesUI,
  getCurrentSubscription
} from './modules/portal/subscriptionModal.js?v=20261116_cf19';

import {
  renderEstimacionesView,
  onSwitchActiveEstimacion,
  promptCreateNewEstimacion,
  confirmDeleteCurrentEstimacion,
  onChangeEstimacionDate,
  onChangeEstimacionMeta,
  onEstimacionAvanceInput,
  onEstimacionAvanceBlur,
  formatAvancePctTwoDecimals,
  exportEstimacionesExcel,
  onEstimacionCantEjeInput,
  onEstimacionCantEjeBlur,
  formatCantEjeTwoDecimals,
  toggleActiveEstimacionLock,
  onEstimacionesAnticipoInput,
  onEstimacionesIvaInput,
  onSearchEstimaciones,
  toggleEstimacionesGroup,
  collapseAllEstimacionesPartidas,
  expandAllEstimacionesPartidas,
  printEstimacionActual,
  adjustConceptoColumnWidth,
  resetConceptoColumnWidth,
  scrollEstimacionesTableStep,
  openEstimacionConceptPhotosModal,
  closeEstimacionConceptPhotosModal,
  onEstimacionPhotoUrlPreviewInput,
  clearEstimacionConceptPhotoSlot,
  saveEstimacionConceptPhotosModal,
  selectEstimacionRow,
  switchEstimacionesSubView,
  onSearchSpecialists,
  setSpecialistsStatusFilter,
  toggleSpecialistHistory,
  promptEditSpecialistProveedor,
  openRegistrarPagoModal,
  closeRegistrarPagoModal,
  onSpecialistModalNodeChanged,
  setPaymentModalAmountPct,
  setPaymentModalAmountDirect,
  setPaymentModalConcept,
  handleSaveSpecialistPayment,
  confirmDeleteSpecialistPayment,
  exportPagosEspecialistasExcel
} from './modules/estimaciones/estimacionesView.js?v=20261116_cf19';

// Exponer funciones públicas al objeto global window para compatibilidad total con eventos inline del HTML
Object.assign(window, {
  // Store & History
  undoAction,
  redoAction,
  
  // Tabs & Views
  switchTab,
  toggleThemeMode,
  applyThemeMode,
  isNightMode,
  isTabLocked,
  setTabLocked,
  toggleTabLock,
  guardTabUnlocked,
  applyTabLocksToDOM,
  openSubscriptionModal,
  closeSubscriptionModal,
  setSubscriptionBillingCycle,
  selectSubscriptionPlan,
  getCurrentSubscription,
  updateSubscriptionBadgesUI,
  
  // Estimaciones de Obra (Modelo Panorama Real)
  renderEstimacionesView,
  onSwitchActiveEstimacion,
  promptCreateNewEstimacion,
  confirmDeleteCurrentEstimacion,
  onChangeEstimacionDate,
  onChangeEstimacionMeta,
  onEstimacionAvanceInput,
  onEstimacionAvanceBlur,
  formatAvancePctTwoDecimals,
  exportEstimacionesExcel,
  onEstimacionCantEjeInput,
  onEstimacionCantEjeBlur,
  formatCantEjeTwoDecimals,
  toggleActiveEstimacionLock,
  onEstimacionesAnticipoInput,
  onEstimacionesIvaInput,
  onSearchEstimaciones,
  toggleEstimacionesGroup,
  collapseAllEstimacionesPartidas,
  expandAllEstimacionesPartidas,
  printEstimacionActual,
  adjustConceptoColumnWidth,
  resetConceptoColumnWidth,
  scrollEstimacionesTableStep,
  selectEstimacionRow,
  switchEstimacionesSubView,
  onSearchSpecialists,
  setSpecialistsStatusFilter,
  toggleSpecialistHistory,
  promptEditSpecialistProveedor,
  openRegistrarPagoModal,
  closeRegistrarPagoModal,
  onSpecialistModalNodeChanged,
  setPaymentModalAmountPct,
  setPaymentModalAmountDirect,
  setPaymentModalConcept,
  handleSaveSpecialistPayment,
  confirmDeleteSpecialistPayment,
  exportPagosEspecialistasExcel,
  
  // Calendario de Obra (Gantt, Financiero, Curva S)
  renderCalendarioObra,
  setCalendarioViewMode,
  setCalendarioTimeScale,
  filterCalendarioPartida,
  changeProjectStartDate,
  onGanttDateInput,
  onGanttDurationInput,
  onFinancialCellEdit,
  triggerAutoDistributeSchedule,
  exportCurrentScheduleExcel,
  printCalendarioObra,
  toggleCalendarioNodeGroup,
  expandAllCalendarioGroups,
  collapseAllCalendarioGroups,
  toggleCalendarioJustifyText,
  changeGanttZoom,
  initGanttResizer,
  syncGanttScroll,
  initGanttBarDrag,
  initPremiereZoomBar,
  updatePremiereZoomBarUI,
  scrollGanttTimelineStep,
  fitGanttTimelineEntireProject,
  changeGanttTodayDateAction,
  resetGanttTodayDateAction,
  initGanttTodayLineDrag,
  openCalendarioJornadaModal,
  closeCalendarioJornadaModal,
  switchCalendarioJornadaTab,
  renderCalendarioJornadaModal,
  toggleNonWorkingDayOfWeek,
  setNonWorkingDaysPreset,
  addFestivoFromModal,
  removeFestivoFromModal,
  loadMexicanHolidaysToModal,
  addLluviaFromModal,
  removeLluviaFromModal,
  saveCalendarioJornadaModal,
  toggleCalendarioCriticalPath,
  toggleCalendarioLinkMode,
  handleCalendarioBarLinkClick,
  undoCalendarioScheduleAction,
  redoCalendarioScheduleAction,
  onGanttPredecessorSelect,
  clearAllCalendarioLinksAction,
  openConceptDependenciesModal,
  closeConceptDependenciesModal,
  clearConceptDependenciesFromModal,
  saveConceptDependenciesModal,
  openCalendarioAiModal,
  closeCalendarioAiModal,
  refreshCalendarioAiPreview,
  runCalendarioGeminiAiProposal,
  applyCalendarioAiProposal,
  selectCalendarioRow,
  
  // Catalog Actions
  addRootRow,
  addChildRow,
  duplicarNode,
  duplicarSelectedRow,
  copiarNode,
  copiarSelectedRow,
  pegarNode,
  pegarSelectedRow,
  limpiarPortapapeles,
  updateClipboardUI,
  getClipboardData,
  openImportConceptsModal,
  closeImportConceptsModal,
  onSelectSourceProject,
  onSearchSourceConcepts,
  toggleConceptSelection,
  selectAllSourceConcepts,
  toggleMatrixPreviewAccordion,
  quickCopyPasteSingleConcept,
  importSelectedConceptsToCurrentProject,
  moverNode,
  moverSelectedRow,
  deleteNode,
  deleteSelectedRow,
  updateNode,
  toggleExpand,
  collapseAllCatalogNodes,
  expandAllCatalogNodes,
  agruparCatalogoConceptos,
  desagruparCatalogoConceptos,
  updateNodeColor,
  clearNodeColor,
  autoAssignCatalogColors,
  repartirEquitativamente,
  toggleSelectNode,
  toggleSelectAll,
  selectRow,
  highlightCatalogRowInPlace,
  closeApuPanel,
  renderTAB1,
  toggleDropdownMenu,
  closeAllDropdownMenus,

  // Cotizaciones y Comparativa de Proveedores (Tabla de Alcances)
  calculateProrrateoCascade,
  switchSidePanelTab,
  getActiveSidePanelTab,
  renderCotizacionesSidePanel,
  openCotizacionModal,
  openAddCotizacionModal: () => openCotizacionModal(null),
  openEditCotizacionModal: (nodeId, cotId) => openCotizacionModal(cotId),
  closeCotizacionModal,
  saveCotizacionForm,
  updateCotizacionModalCostoPreview,
  handleModalFileInputChange,
  handleUploadCotizacionFile: handleCardDirectFileUpload,
  handleViewCotizacionPdf: viewCotizacionPdf,
  handleSelectCotizacionGanador: (nodeId, cotId, checked) => {
    if (checked) setCotizacionGanadora(nodeId, cotId);
    else unsetCotizacionGanadora(nodeId, cotId);
  },
  handleDeleteCotizacion: (nodeId, cotId) => {
    if (confirm('¿Eliminar esta propuesta de cotización?')) {
      deleteCotizacion(nodeId, cotId);
    }
  },
  selectRowAndOpenProveedores: (nodeId, event) => {
    if (event) event.stopPropagation();
    selectRow(nodeId);
    switchSidePanelTab('proveedores');
  },
  setCotizacionGanadora,
  unsetCotizacionGanadora,
  deleteCotizacion,
  addCotizacion,
  updateCotizacion,
  cleanPhoneForWhatsApp,

  // Insumos Generales
  renderInsumosGenerales,
  filterInsumosGeneralesTable,
  toggleSelectAllInsumos,
  updateCostoUnitarioGeneral,
  combinarInsumosSeleccionados,
  openCombinarModal,
  closeCombinarModal,
  selectCombinarTarget,
  ejecutarCombinacionInsumos,
  filterInsumosCategoryView,
  toggleInsumoCard,
  agruparInsumosBase,
  desagruparInsumosBase,
  collapseAllInsumosCategories,
  expandAllInsumosCategories,
  actualizarCostoIndividualConIA,
  actualizarCostosConIASeleccionados,
  actualizarTodosLosInsumosSeleccionadosConIA,
  selectInsumoBaseRow,

  // Settings & Modals
  openSettingsModal,
  closeSettingsModal,
  switchSettingsTab,
  toggleSettingsAdvancedSection,
  toggleAdvancedBlock,
  onSimpleGastosInput,
  onBreakdownGastosInput,
  updateCalculatedFactorPreview,
  updateFasarPreview,
  setSettingsPreset,
  saveSettings,
  onCurrencySelectChange,
  updateCurrencyPreview,
  toggleApiKeyVisibility,
  resetToDemoData,
  clearAllData,
  closeAdminDualLoginModal,
  closeComparisonModal,
  initUniversalModalBackdrop,

  // Import / Export
  exportData,
  importData,
  openExportModal,
  closeExportModal,
  exportCatalogExcel,
  exportCatalogOpusZip,
  exportCatalogNeodataZip,
  exportCatalogOpus,
  exportCatalogNeodata,
  exportCatalogCsv,
  openImportModal,
  closeImportModal,
  handleUniversalFileSelect,
  onSheetSelectChange,
  executeImport,
  toggleImportDestination,
  resetImportModalUI,
  onZoneSelectChange,
  calculateParsedBudgetTotal,
  loadCasaLauraOpusDirectly,
  reloadCasaLauraOpus: loadCasaLauraOpusDirectly,

  // Master Catalog (Opción 1)
  openMasterCatalogModal,
  closeMasterCatalogModal,
  onMasterCatalogSearchInput,
  triggerMasterCatalogSearch,
  insertConceptIntoBudget,
  switchMasterCatalogTab,
  handleDeleteCatalog,
  refreshMasterCatalogList,
  installPresetCatalog,
  installAllPresets,

  // Utilities
  showToast,

  // Branding (Empresa, Proyecto, Ubicación y Logo interactivo)
  initBranding,
  updateCompanyName,
  syncCompanyName,
  updateProjectName,
  syncProjectName,
  updateProjectLocation,
  syncProjectLocation,
  updateCompanySubtitle,
  triggerCompanyLogoUpload,
  handleCompanyLogoUpload,
  removeCompanyLogo,
  openCurrentLogoAdjuster,
  closeLogoAdjusterModal,
  setLogoZoom,
  adjustLogoZoom,
  resetLogoPosition,
  setLogoBgMode,
  applyAdjustedLogo,

  // Print Services
  printTab1Catalog,
  printTab1CatalogWithCotizaciones,
  openCatalogPrintModal,
  closeCatalogPrintModal,
  printConceptoCotizaciones,
  printInsumosGenerales,
  printCalendarioObraFormat,
  printEstimacionesFormat,

  // Firmas y Responsables para Impresión
  openFirmasResponsablesModal,
  closeFirmasResponsablesModal,
  addFirmaSlotAction,
  removeFirmaSlotAction,
  toggleFirmaSlotAction,
  updateFirmaSlotField,
  resetFirmasToDefaultAction,
  saveFirmasModalAction,
  previewPrintWithFirmasAction,
  quickAssignPersonToFirstEmptySlot,
  getFirmasPrintHtml,

  // Portal, Perfil y Multi-Proyecto
  initPortal,
  showPortalView,
  renderPortalAuth,
  updatePortalHeaderUserArea,
  updateWorkspaceHeaderUser,
  switchAuthTab,
  setRegSexo,
  handleCustomPhotoUpload,
  handleRegisterSubmit,
  handleLoginSubmit,
  quickLoginWithFeaturedUser,
  removeFeaturedUserAccount,
  quickLoginWithSavedUser,
  removeSavedUserQuickProfile,
  purgeAllUsersAndAccountsAction,
  togglePasswordVisibility,
  checkPasswordMatchLive,
  triggerGoogleSignIn,
  closeGoogleAuthModal,
  selectGoogleAccount,
  submitCustomGoogleAccount,
  renderPortalDashboard,
  filterProjectCards,
  onProjectSearchInput,
  setCompanyFilter,
  setTipoObraFilter,
  setProjectScopeFilter,
  setProjectDashboardMode,
  toggleSortDate,
  toggleSortAZ,
  resetProjectFilters,
  refreshProjectsGridUI,
  renderCompanyOptionsHTML,
  openProjectInWorkspace,
  openProjectInNewTab,
  goToProjectsDashboard,
  duplicateProjectAction,
  deleteProjectAction,
  syncProjectToCloudAction,
  openNuevoProyectoModal,
  openNewProjectModal,
  closeNuevoProyectoModal,
  goToWizardStep,
  handleWizardLogoFile,
  setSampleLogo,
  clearWizardLogo,
  onWizardCurrencyChange,
  updateWizardFactorPreview,
  updateTemplateSelection,
  finalizeCreateProject,
  openProfileModal,
  closeProfileModal,
  onProfileEditSexoChange,
  selectProfileAvatar,
  handleProfilePhotoUpload,
  saveProfileChanges,
  deleteUserAccount,
  deleteCurrentUserAccountAction,
  logoutUser,
  logoutAllDevices,
  toggleUserDropdown,
  closeUserDropdown,
  togglePortalUserDropdown,
  closePortalUserDropdown,
  renderMemberAvatarsHTML,
  openInviteModal,
  closeInviteModal,
  switchInviteModalTab,
  setInviteTabCheckboxes,
  toggleMemberTabPermission,
  setMemberAllTabsPermission,
  setInviteSexo,
  handleInvitePhotoUpload,
  selectInvitePreset,
  submitInviteMember,
  changeMemberRole,
  removeMemberFromProject,
  getActiveOrFallbackProjectId,
  copyProjectInviteLink,
  renderHeaderCollaborators,
  openPlanInviteModal,
  closePlanInviteModal,
  switchPlanInviteModalTab,
  setPlanInviteSexo,
  updatePlanInviteAvatarPreview,
  handlePlanInvitePhotoUpload,
  selectPlanInvitePreset,
  submitPlanInviteMember,
  changePlanCollaboratorRole,
  onRemovePlanCollaboratorClick,
  copyPlanInviteLink,
  TAB_METADATA,
  canCurrentUserAccessTab,
  updateNavigationTabsAccess,
  renderTabAssignedAvatars,
  renderAllTabAssignedMembers,
  openTabMembersAssignModal,
  closeTabMembersAssignModal,
  renderTabMembersModalList,
  onTabMemberCheckChange,
  toggleSelectAllTabMembers,
  saveTabMembersAssignment,
  simulateUserView,
  toggleComparisonModal,
  switchPortalView,
  switchView,
  toggleCardMenu,
  filterProjects,
  toggleSort,
  setStatusFilter,
  resetFilters,
  subscribeToProjectRealtime,
  unsubscribeFromProjectRealtime,
  exportProjectToExcelAction,

  // Información de la Plataforma
  openPlatformInfoModal,
  closePlatformInfoModal,
  handlePlatformInfoEmpiezaGratis,
  handlePlatformInfoVerPlanes,

  // Centro de Tutoriales & Tours
  openTutorialHubModal,
  closeTutorialHubModal,
  launchTourFromHub,
  launchVideoFromHub,
  resetTourPreferencesFromHub,
  startInteractiveTour,
  skipInteractiveTour,
  closeInteractiveTour,
  checkAndResumeTourOnLoad,
  openVideoSimulatorModal,
  closeVideoSimulatorModal,
  toggleVoiceNarration
});

// Asignaciones globales explícitas en window
window.openPlatformInfoModal = openPlatformInfoModal;
window.closePlatformInfoModal = closePlatformInfoModal;
window.handlePlatformInfoEmpiezaGratis = handlePlatformInfoEmpiezaGratis;
window.handlePlatformInfoVerPlanes = handlePlatformInfoVerPlanes;
window.openTutorialHubModal = openTutorialHubModal;
window.closeTutorialHubModal = closeTutorialHubModal;
window.launchTourFromHub = launchTourFromHub;
window.launchVideoFromHub = launchVideoFromHub;
window.resetTourPreferencesFromHub = resetTourPreferencesFromHub;
window.startInteractiveTour = startInteractiveTour;
window.skipInteractiveTour = skipInteractiveTour;
window.closeInteractiveTour = closeInteractiveTour;
window.checkAndResumeTourOnLoad = checkAndResumeTourOnLoad;
window.openVideoSimulatorModal = openVideoSimulatorModal;
window.closeVideoSimulatorModal = closeVideoSimulatorModal;
window.toggleVoiceNarration = toggleVoiceNarration;

// Atajos de teclado:
// - Alt + Flecha Arriba / Abajo para mover la fila seleccionada
// - Ctrl + C / Cmd + C para copiar concepto seleccionado con toda su matriz APU
// - Ctrl + V / Cmd + V para pegar concepto copiado con su matriz APU
document.addEventListener('keydown', (e) => {
  const isEditingText = ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement?.tagName);

  if (e.altKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
    if (state.activeSelectedId) {
      e.preventDefault();
      moverSelectedRow(e.key === 'ArrowUp' ? 'up' : 'down');
    }
  } else if (!isEditingText && (e.ctrlKey || e.metaKey)) {
    const viewCalendario = document.getElementById('view-calendario');
    const isCalendarioActive = viewCalendario && !viewCalendario.classList.contains('hidden');

    if (isCalendarioActive && (e.key === 'z' || e.key === 'Z')) {
      e.preventDefault();
      if (e.shiftKey) {
        redoCalendarioScheduleAction();
      } else {
        undoCalendarioScheduleAction();
      }
    } else if (isCalendarioActive && (e.key === 'y' || e.key === 'Y')) {
      e.preventDefault();
      redoCalendarioScheduleAction();
    } else if (e.key === 'c' || e.key === 'C') {
      if (state.activeSelectedId) {
        e.preventDefault();
        copiarSelectedRow();
      }
    } else if (e.key === 'v' || e.key === 'V') {
      e.preventDefault();
      pegarSelectedRow();
    }
  }
});

// Selección universal de filas en cualquier tabla del área de proyecto (mismo color y estilo que Catálogo Base)
function handleWorkspaceTableRowSelection(e) {
  const target = e.target;
  if (!target || typeof target.closest !== 'function') return;

  // Ignorar fuera del área de proyecto
  if (!target.closest('#workspace-container')) return;

  // Soporte para filas divididas del Gantt (panel izquierdo y derecho)
  const ganttRow = target.closest('[data-gantt-left-row], [data-gantt-right-row]');
  if (ganttRow) {
    const rowId = ganttRow.getAttribute('data-gantt-left-row') || ganttRow.getAttribute('data-gantt-right-row');
    if (rowId) selectCalendarioRow(rowId, e);
    return;
  }

  const tr = target.closest('tbody tr');
  if (!tr) return;

  // Ignorar filas vacías informativas de una sola celda con colspan
  if (tr.children.length === 1 && tr.children[0].hasAttribute('colspan')) return;

  if (tr.dataset.nodeId) {
    highlightCatalogRowInPlace(tr.dataset.nodeId);
    return;
  }
  if (tr.dataset.itemKey) {
    selectInsumoBaseRow(tr.dataset.itemKey);
    return;
  }
  if (tr.dataset.finRow) {
    selectCalendarioRow(tr.dataset.finRow, e);
    return;
  }
  if (tr.dataset.curvaRow) {
    selectCalendarioRow(tr.dataset.curvaRow, e);
    return;
  }
  if (tr.dataset.estRow) {
    selectEstimacionRow(tr.dataset.estRow, e);
    return;
  }

  // Cualquier otra tabla dentro del área de proyecto
  const tbody = tr.parentElement;
  if (tbody) {
    tbody.querySelectorAll('tr.selected-row').forEach((r) => r.classList.remove('selected-row'));
    tr.classList.add('selected-row');
  }
}

document.addEventListener('click', handleWorkspaceTableRowSelection);
document.addEventListener('focusin', handleWorkspaceTableRowSelection);

// Sincronizar portapapeles compartido en tiempo real entre pestañas
window.addEventListener('storage', (e) => {
  if (e.key === STORAGE_KEY_CLIPBOARD) {
    syncClipboardFromStorage();
    updateClipboardUI();
  renderHeaderCollaborators();
  renderAllTabAssignedMembers();
  updateNavigationTabsAccess();
    renderTAB1();
  }
});

// Conectar callback de renderizado al cambiar el candado de bloqueo de pestaña
setTabLockRenderCallback((tabKey) => {
  updateUndoRedoButtons();
  if (tabKey === 'cat' || tabKey === 'alcances') {
    renderTAB1();
  } else if (tabKey === 'insumos') {
    renderInsumosGenerales();
  } else if (tabKey === 'presupuesto') {
    renderPresupuestoView();
  } else if (tabKey === 'seguimiento') {
    renderSeguimientoView();
  } else if (tabKey === 'calendario') {
    renderCalendarioObra();
  } else if (tabKey === 'estimaciones') {
    renderEstimacionesView();
  }
});

// Conectar callback de renderizado en historial de deshecho/rehecho
setHistoryRenderCallback(() => {
  renderTAB1();
  const viewPresupuesto = document.getElementById('view-presupuesto');
  if (viewPresupuesto && !viewPresupuesto.classList.contains('hidden')) {
    renderPresupuestoView();
  }
  const viewSeguimiento = document.getElementById('view-seguimiento');
  if (viewSeguimiento && !viewSeguimiento.classList.contains('hidden')) {
    renderSeguimientoView();
  }
  const viewInsumos = document.getElementById('view-insumos');
  if (viewInsumos && !viewInsumos.classList.contains('hidden')) {
    renderInsumosGenerales();
  }
  const viewCalendario = document.getElementById('view-calendario');
  if (viewCalendario && !viewCalendario.classList.contains('hidden')) {
    renderCalendarioObra();
  }
});

// Conectar callback de renderizado al cambiar entre Vista de Día y Modo Nocturno
setThemeRenderCallback(() => {
  renderTAB1();
  const viewPresupuesto = document.getElementById('view-presupuesto');
  if (viewPresupuesto && !viewPresupuesto.classList.contains('hidden')) {
    renderPresupuestoView();
  }
  const viewSeguimiento = document.getElementById('view-seguimiento');
  if (viewSeguimiento && !viewSeguimiento.classList.contains('hidden')) {
    renderSeguimientoView();
  }
  const viewInsumos = document.getElementById('view-insumos');
  if (viewInsumos && !viewInsumos.classList.contains('hidden')) {
    renderInsumosGenerales();
  }
  const viewCalendario = document.getElementById('view-calendario');
  if (viewCalendario && !viewCalendario.classList.contains('hidden')) {
    renderCalendarioObra();
  }
  const viewEstimaciones = document.getElementById('view-estimaciones');
  if (viewEstimaciones && !viewEstimaciones.classList.contains('hidden')) {
    renderEstimacionesView();
  }
  const subModal = document.getElementById('modal-suscripcion-usuario');
  if (subModal && !subModal.classList.contains('hidden')) {
    renderSubscriptionCards();
  }
});

// Sincronizar tema visual entre pestañas abiertas
window.addEventListener('storage', (e) => {
  if (e.key === STORAGE_KEY_THEME) {
    applyThemeMode(e.newValue === 'night' ? 'night' : 'day', { persist: false, notify: false, rerender: true });
  }
});

// Inicializar tema visual (Vista de Día por defecto o Modo Nocturno guardado)
initThemeMode();
try {
  initAuthListener((event, session, perfil) => {
    if (session?.user) {
      let currentUser = getCurrentUser();
      if (!currentUser) {
        currentUser = syncLocalUserSession(session.user, perfil, true);
      }
      if (!currentUser) {
        if (!document.getElementById('login-email')) {
          showPortalView('login');
        }
        return;
      }

      if (event === 'SIGNED_IN' || event === 'USER_UPDATED' || event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED' || event === 'PROFILE_LOADED') {
        const isInternalSync = (event === 'USER_UPDATED' && typeof window !== 'undefined' && typeof window.isRecentInternalCloudAuthUpdate === 'function' && window.isRecentInternalCloudAuthUpdate());
        const workspaceContainer = document.getElementById('workspace-container');
        const activePId = getActiveProjectId() || (typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('project'));
        const isWorkspaceVisible = (workspaceContainer && !workspaceContainer.classList.contains('hidden') && workspaceContainer.style.display !== 'none') || !!activePId;
        if (!isWorkspaceVisible) {
          const projectsGridExists = !!(document.getElementById('projectsGrid') || document.getElementById('projects-grid'));
          const menuWrapper = document.getElementById('portal-user-menu-wrapper');
          const currentMenuEmail = menuWrapper?.dataset?.userEmail || '';
          const incomingEmail = (session.user.email || '').toLowerCase().trim();
          if (projectsGridExists && menuWrapper && (!currentMenuEmail || currentMenuEmail === incomingEmail) && (event === 'INITIAL_SESSION' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED' || event === 'PROFILE_LOADED')) {
            try { updatePortalHeaderUserArea(currentUser); } catch (_) {}
          } else if (event === 'SIGNED_IN' || (event === 'USER_UPDATED' && !isInternalSync) || !projectsGridExists || currentMenuEmail !== incomingEmail) {
            showPortalView('dashboard');
          }
        } else {
          try { updateWorkspaceHeaderUser(currentUser); } catch (_) {}
        }
        try { renderSidebarNotificationsUI(); } catch (_) {}
        if (!isInternalSync && event !== 'PROFILE_LOADED' && event !== 'TOKEN_REFRESHED') {
          try { initGlobalRealtimeSync(); } catch (_) {}
        }

        if (typeof window !== 'undefined' && window.location.hash && (window.location.hash.includes('access_token') || window.location.hash.includes('type=recovery'))) {
          window.history.replaceState(null, document.title, window.location.pathname + window.location.search);
        }
      }
    } else if (event === 'SIGNED_OUT') {
      updatePortalHeaderUserArea(null);
      if (!document.getElementById('login-email') && !isSsoHydrationPending()) {
        showPortalView('login');
      }
    }
  });
} catch (_) {}

let workspaceModulesBooted = false;

function bootWorkspaceModules() {
  if (workspaceModulesBooted) return;
  workspaceModulesBooted = true;
  initStore();
  getProjectPresupuestoConfig();
  initBranding();
  initPanelResizer();
  renderTAB1();
  updateUndoRedoButtons();
  updateClipboardUI();
  openReferenceDb().catch(err => console.warn('IndexedDB reference DB:', err));
  const activePId = getActiveProjectId();
  if (activePId) {
    try {
      subscribeToProjectRealtime(activePId);
    } catch (e) {
      console.warn('[Realtime] Aviso al conectar canal de obra:', e);
    }
    try {
      hydrateProjectModulesFromCloud(activePId).then((changed) => {
        if (changed) {
          applyTabLocksToDOM();
          renderProjectChatDock();
          renderSidebarNotificationsUI();
          const viewSeguimiento = document.getElementById('view-seguimiento');
          if (viewSeguimiento && !viewSeguimiento.classList.contains('hidden')) renderSeguimientoView();
          const viewCalendario = document.getElementById('view-calendario');
          if (viewCalendario && !viewCalendario.classList.contains('hidden')) renderCalendarioObra();
          const viewEstimaciones = document.getElementById('view-estimaciones');
          if (viewEstimaciones && !viewEstimaciones.classList.contains('hidden')) renderEstimacionesView();
        }
      }).catch(() => {});
    } catch (_) {}
  }

  // Inicializar canal WebSocket global para invitaciones y proyectos en tiempo real
  try {
    initGlobalRealtimeSync();
  } catch (e) {
    console.warn('[Realtime] Aviso inicializando sincronización global:', e);
  }
}

function renderSsoConnectingOverlay() {
  if (typeof document === 'undefined') return;
  const main = document.getElementById('portal-main-container');
  if (!main) return;
  main.innerHTML = `
    <div class="max-w-md mx-auto w-full my-16 p-8 rounded-3xl bg-slate-900/90 border border-slate-800 text-center text-white shadow-2xl">
      <div class="w-12 h-12 rounded-2xl bg-blue-600/20 border border-blue-500/40 text-blue-400 flex items-center justify-center mx-auto mb-4">
        <i class="fa-solid fa-spinner fa-spin text-xl"></i>
      </div>
      <h2 class="text-lg font-extrabold tracking-tight">Conectando tu sesión Cubikar...</h2>
      <p class="text-xs text-slate-400 mt-2">Cargando tus proyectos sin volver a iniciar sesión.</p>
    </div>
  `;
}

try {
  initAppSwitcher('cubikar-app-switcher-mount', 'arq');
} catch (_) {}

function bootGlobalRealtimeAfterAuth() {
  try {
    initGlobalRealtimeSync();
  } catch (e) {}
}

// Inicialización de la aplicación al cargar el módulo (con soporte fluido de SSO entre subdominios y auto-reparación de JWT)
if (hasPendingIncomingSsoSession() || hasOversizedLocalJwt()) {
  renderSsoConnectingOverlay();
  Promise.race([
    (async () => {
      let res = { hydrated: false };
      if (hasPendingIncomingSsoSession()) {
        res = await hydrateIncomingSsoSession();
      }
      await ensureCompactAuthSession();
      return res;
    })(),
    new Promise((resolve) => setTimeout(() => resolve({ hydrated: false }), 6500))
  ]).finally(() => {
    try {
      const hasProjectParam = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('project');
      const alreadyRenderedDashboard = !hasProjectParam && getCurrentUser() && !!document.getElementById('projects-grid');
      if (!alreadyRenderedDashboard) {
        const isWorkspaceActive = initPortal();
        if (isWorkspaceActive) bootWorkspaceModules();
      }
    } catch (_) {}
    bootGlobalRealtimeAfterAuth();
  });
} else {
  const isWorkspaceActive = initPortal();
  if (isWorkspaceActive) {
    bootWorkspaceModules();
  }
  bootGlobalRealtimeAfterAuth();
}

// Asegurar renderizado de colaboradores en el encabezado de proyecto y app switcher
if (typeof document !== 'undefined') {
  try {
    initAppSwitcher('cubikar-app-switcher-mount', 'arq');
  } catch (_) {}
  renderHeaderCollaborators();
  renderAllTabAssignedMembers();
  updateNavigationTabsAccess();
  updateSubscriptionBadgesUI();
  applyTabLocksToDOM();
  renderProjectChatDock();

  try {
    const urlTab = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('tab');
    if (urlTab && typeof switchTab === 'function') {
      switchTab(urlTab);
      setTimeout(() => switchTab(urlTab), 100);
      setTimeout(() => switchTab(urlTab), 350);
      setTimeout(() => switchTab(urlTab), 800);
    }
  } catch (_) {}
}

window.handleAcceptInvitationAction = handleAcceptInvitationAction;
window.handleRejectInvitationAction = handleRejectInvitationAction;
window.setProjectChatDivision = setProjectChatDivision;
window.syncProjectChatDivisionWithTab = syncProjectChatDivisionWithTab;
window.onProjectChatEntryTypeChange = onProjectChatEntryTypeChange;
window.onProjectChatSearchInput = onProjectChatSearchInput;
window.clearProjectChatSearch = clearProjectChatSearch;
window.toggleMoveChatMessageMenu = toggleMoveChatMessageMenu;
window.moveProjectChatMessageDivision = moveProjectChatMessageDivision;
window.openProjectChatPrintModal = openProjectChatPrintModal;
window.closeProjectChatPrintModal = closeProjectChatPrintModal;
window.confirmProjectChatPrintFromModal = confirmProjectChatPrintFromModal;
window.onPrintModalScopeChange = onPrintModalScopeChange;
window.toggleProjectChatDock = toggleProjectChatDock;
window.toggleProjectChatMaximize = toggleProjectChatMaximize;
window.printProjectChatReport = printProjectChatReport;
window.openProjectChatForPartida = openProjectChatForPartida;
window.clearProjectChatPartidaFilter = clearProjectChatPartidaFilter;
window.setProjectChatFilter = setProjectChatFilter;
window.onProjectChatAuthorChange = onProjectChatAuthorChange;
window.toggleProjectChatTagPicker = toggleProjectChatTagPicker;
window.addProjectChatPendingTag = addProjectChatPendingTag;
window.removeProjectChatPendingTag = removeProjectChatPendingTag;
window.sendProjectChatMessage = sendProjectChatMessage;
window.deleteProjectChatMessage = deleteProjectChatMessage;
window.jumpToProjectChatTag = jumpToProjectChatTag;
window.renderProjectChatDock = renderProjectChatDock;
window.toggleMentionNotificationsPopover = toggleMentionNotificationsPopover;
window.closeMentionNotificationsPopover = closeMentionNotificationsPopover;
window.onNotificationsUserFilterChange = onNotificationsUserFilterChange;
window.markAllMentionsAsRead = markAllMentionsAsRead;
window.openMentionNotification = openMentionNotification;
window.renderSidebarNotificationsUI = renderSidebarNotificationsUI;
window.loadProjectChatMessages = loadProjectChatMessages;
window.resetDefaultProjectChatWithFeedback = resetDefaultProjectChatWithFeedback;
window.generateSeedProjectChatMessages = generateSeedProjectChatMessages;
window.seedDefaultProjectChat = (pid, force = false) => {
  if (force) {
    resetDefaultProjectChatWithFeedback(pid);
  } else {
    return loadProjectChatMessages ? loadProjectChatMessages(pid) : generateSeedProjectChatMessages(pid);
  }
};
window.openEstimacionConceptPhotosModal = openEstimacionConceptPhotosModal;
window.closeEstimacionConceptPhotosModal = closeEstimacionConceptPhotosModal;
window.onEstimacionPhotoUrlPreviewInput = onEstimacionPhotoUrlPreviewInput;
window.clearEstimacionConceptPhotoSlot = clearEstimacionConceptPhotoSlot;
window.saveEstimacionConceptPhotosModal = saveEstimacionConceptPhotosModal;
window.renderPresupuestoView = renderPresupuestoView;
window.togglePresupuestoSelectNode = togglePresupuestoSelectNode;
window.togglePresupuestoSelectAll = togglePresupuestoSelectAll;
window.togglePresupuestoSubtituloExpand = togglePresupuestoSubtituloExpand;
window.agruparPresupuestoConceptos = agruparPresupuestoConceptos;
window.desagruparPresupuestoConceptos = desagruparPresupuestoConceptos;
window.renderSeguimientoView = renderSeguimientoView;
window.logoutAllDevices = logoutAllDevices;
window.renderHeaderCollaborators = renderHeaderCollaborators;
window.renderAllTabAssignedMembers = renderAllTabAssignedMembers;
window.updateNavigationTabsAccess = updateNavigationTabsAccess;

setProjectChatRefreshCallback(() => {
  renderTAB1();
  const viewPresupuesto = document.getElementById('view-presupuesto');
  if (viewPresupuesto && !viewPresupuesto.classList.contains('hidden')) {
    renderPresupuestoView();
  }
  const viewSeguimiento = document.getElementById('view-seguimiento');
  if (viewSeguimiento && !viewSeguimiento.classList.contains('hidden')) {
    renderSeguimientoView();
  }
  const viewCalendario = document.getElementById('view-calendario');
  if (viewCalendario && !viewCalendario.classList.contains('hidden')) {
    renderCalendarioObra();
  }
  const viewEstimaciones = document.getElementById('view-estimaciones');
  if (viewEstimaciones && !viewEstimaciones.classList.contains('hidden')) {
    renderEstimacionesView();
  }
});

// Auto-activación inmediata de pestaña por parámetro de URL (ej. ?tab=seguimiento)
try {
  const pUrl = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const reqTab = pUrl ? pUrl.get('tab') : null;
  if (reqTab && typeof switchTab === 'function') {
    switchTab(reqTab);
  }
} catch (_) {}

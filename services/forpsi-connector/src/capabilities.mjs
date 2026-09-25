export function capabilities() {
  return {
    liveAccountVerified: false,
    modules: [
      { id: 'mail', implementation: 'IMAP_SMTP_ADAPTER', nativeSync: 'UNVERIFIED_ON_ACCOUNT',
        actions: ['search','read','draft','send','move','flags','trash','create_folder','schedule','cancel_schedule'] },
      { id: 'labels', implementation: 'CONNECTOR_STORAGE', nativeSync: 'UNAVAILABLE', actions: ['create','edit','assign','remove_assignment'] },
      { id: 'rules', implementation: 'CONNECTOR_STORAGE', nativeSync: 'UNAVAILABLE', actions: ['create','edit','assign_folder','preview','apply_selected_messages'], automaticIncomingExecution: false },
      { id: 'calendar', implementation: 'CALDAV_ADAPTER', nativeSync: 'UNVERIFIED_ON_ACCOUNT',
        actions: ['list_calendars','list_events','read_event','create_event','edit_simple_event','delete_simple_event'],
        requirements: ['Business Mail', 'CalDAV enabled for the calendar'], invitations: false, recurrenceWrites: false },
      { id: 'files', implementation: 'NOT_IMPLEMENTED', nativeSync: 'UNAVAILABLE', reason: 'Supported Forpsi files API not verified' },
      { id: 'contacts', implementation: 'CARDDAV_ADAPTER', nativeSync: 'UNVERIFIED_ON_ACCOUNT',
        actions: ['list_address_books','search_contacts','read_contact','create_contact','edit_contact','delete_contact'], requirements: ['Business Mail', 'CardDAV enabled'] },
      { id: 'tasks', implementation: 'NOT_IMPLEMENTED', nativeSync: 'UNAVAILABLE', reason: 'Forpsi task synchronization contract not verified; do not assume CalDAV VTODO support' },
      { id: 'notes', implementation: 'NOT_IMPLEMENTED', nativeSync: 'UNAVAILABLE', reason: 'Supported Forpsi notes API not verified' },
      { id: 'signatures', implementation: 'NOT_IMPLEMENTED', nativeSync: 'UNAVAILABLE', reason: 'Forpsi signature settings API not verified; native signatures are not automatically applied to SMTP mail' },
    ],
  };
}

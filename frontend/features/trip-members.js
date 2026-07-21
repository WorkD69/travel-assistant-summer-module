(function membersModule() {
  const membersInstances = new WeakMap();

  function membersCreateInstance(membersRoot) {

  const membersRoleOrganizer = 'Организатор';
  const membersRoleParticipant = 'Участник';
  const membersStatusWaiting = 'Ожидает ответа';
  const membersStatusAccepted = 'Принято';
  const membersStatusRejected = 'Отклонено';
  const membersStatusRevoked = 'Отозвано';
  const membersStatusExpired = 'Срок истёк';

  // Роли в store хранятся как 'organizer'/'participant'; в UI используются русские подписи.
  function membersRoleFromShared(membersSharedRole) {
    return membersSharedRole === 'organizer' ? membersRoleOrganizer : membersRoleParticipant;
  }

  function membersRoleToShared(membersRole) {
    return membersRole === membersRoleOrganizer ? 'organizer' : 'participant';
  }

  // Единый источник исходных данных — TravelAppState (features/app-state.js).
  function membersReadShared() {
    const membersShared = window.TravelAppState ? window.TravelAppState.getState() : null;
    return {
      membersMembers: membersShared ? membersShared.participants.map((membersParticipant) => ({ ...membersParticipant, role: membersRoleFromShared(membersParticipant.role) })) : [],
      membersInvites: membersShared ? membersShared.invitations.map((membersInvite) => ({ ...membersInvite })) : [],
      membersMode: membersShared && membersShared.currentUser.currentTripRole === 'participant' ? 'participant' : 'organizer',
    };
  }

  const membersSeed = membersReadShared();

  const membersState = {
    mode: membersSeed.membersMode,
    inviteFilter: 'all',
    members: membersSeed.membersMembers,
    invites: membersSeed.membersInvites,
    menuOpenFor: null,
    pendingMemberId: null,
    pendingInviteId: null,
    lastFocus: null,
    generatedInvite: null,
    inviteSequence: 1,
  };

  const membersEls = {
    header: membersRoot.querySelector('#members-header'),
    content: membersRoot.querySelector('#members-content'),
    accessDenied: membersRoot.querySelector('#members-access-denied'),
    errorPanel: membersRoot.querySelector('#members-error-panel'),
    count: membersRoot.querySelector('#members-count'),
    inviteButton: membersRoot.querySelector('#members-invite-button'),
    resetButton: membersRoot.querySelector('#members-reset-demo'),
    retryButton: membersRoot.querySelector('#members-retry-button'),
    homeButton: membersRoot.querySelector('#members-home-button'),
    list: membersRoot.querySelector('#members-list'),
    listState: membersRoot.querySelector('#members-list-state'),
    inviteList: membersRoot.querySelector('#members-invite-list'),
    inviteState: membersRoot.querySelector('#members-invite-state'),
    inviteSection: membersRoot.querySelector('#members-invitations-section'),
    readonlyNote: membersRoot.querySelector('#members-readonly-note'),
    offlinePanel: membersRoot.querySelector('#members-offline-panel'),
    modalLayer: membersRoot.querySelector('#members-modal-layer'),
    modalTitle: membersRoot.querySelector('#members-modal-title'),
    modalDesc: membersRoot.querySelector('#members-modal-desc'),
    modalBody: membersRoot.querySelector('#members-modal-body'),
    modalFoot: membersRoot.querySelector('#members-modal-foot'),
    modalClose: membersRoot.querySelector('#members-modal-close'),
    sheet: membersRoot.querySelector('#members-actions-sheet'),
    sheetActions: membersRoot.querySelector('#members-sheet-actions'),
    toastStack: membersRoot.querySelector('#members-toast-stack'),
  };

  function membersTripStatus() {
    return window.TravelAppState ? window.TravelAppState.getState().trip.status : 'active';
  }

  function membersCanManage() {
    if (membersTripStatus() !== 'active') return false;
    return membersState.mode === 'organizer' || membersState.mode === 'empty';
  }

  function membersIsReadOnlyMode() {
    if (membersTripStatus() === 'completed') return true;
    return membersState.mode === 'participant' || membersState.mode === 'offline';
  }

  let membersSyncingToShared = false;

  function membersCommitShared(membersExtraUpdate) {
    if (!window.TravelAppState) return;
    const membersUpdate = {
      participants: membersState.members.map((membersMember) => ({ ...membersMember, role: membersRoleToShared(membersMember.role) })),
      invitations: membersState.invites.map((membersInvite) => ({ ...membersInvite })),
    };
    if (membersExtraUpdate) Object.assign(membersUpdate, membersExtraUpdate);
    membersSyncingToShared = true;
    window.TravelAppState.setState(membersUpdate, { source: 'members' });
    membersSyncingToShared = false;
  }

  function membersHandleSharedChange(membersSharedState, membersChangedKeys, membersMeta) {
    if (membersSyncingToShared || (membersMeta && membersMeta.source === 'members')) return;
    const membersReset = Boolean(membersMeta && membersMeta.reset);
    const membersKeys = membersChangedKeys || [];
    const membersRelevant = membersReset || membersKeys.some((membersKey) => ['participants', 'invitations', 'currentUser', 'trip'].indexOf(membersKey) !== -1);
    if (!membersRelevant) return;
    membersState.members = membersSharedState.participants.map((membersParticipant) => ({ ...membersParticipant, role: membersRoleFromShared(membersParticipant.role) }));
    membersState.invites = membersSharedState.invitations.map((membersInvite) => ({ ...membersInvite }));
    const membersDesiredMode = membersSharedState.currentUser && membersSharedState.currentUser.currentTripRole === 'participant' ? 'participant' : 'organizer';
    if ((membersState.mode === 'organizer' || membersState.mode === 'participant') && membersState.mode !== membersDesiredMode) {
      membersState.mode = membersDesiredMode;
      membersSyncModeControls();
    }
    if (membersReset) {
      membersState.mode = 'organizer';
      membersState.inviteFilter = 'all';
      membersState.menuOpenFor = null;
      membersState.pendingMemberId = null;
      membersState.pendingInviteId = null;
      membersState.generatedInvite = null;
      membersState.inviteSequence = 1;
      if (membersEls.modalLayer && membersEls.modalLayer.classList.contains('members-open')) membersCloseModal({ restoreFocus: false });
      membersSyncModeControls();
    }
    membersRender();
  }

  function membersEscape(membersValue) {
    return String(membersValue)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function membersPlural(membersCount) {
    const membersMod10 = membersCount % 10;
    const membersMod100 = membersCount % 100;
    if (membersMod10 === 1 && membersMod100 !== 11) return `${membersCount} участник`;
    if (membersMod10 >= 2 && membersMod10 <= 4 && (membersMod100 < 12 || membersMod100 > 14)) return `${membersCount} участника`;
    return `${membersCount} участников`;
  }

  function membersGetMember(membersMemberId) {
    return membersState.members.find((membersMember) => membersMember.id === membersMemberId);
  }

  function membersGetInvite(membersInviteId) {
    return membersState.invites.find((membersInvite) => membersInvite.id === membersInviteId);
  }

  function membersGetVisibleMembers() {
    if (membersState.mode === 'empty') {
      return [{ ...membersInitialMembers[0] }];
    }
    return membersState.members;
  }

  function membersGetVisibleInvites() {
    if (membersState.mode === 'empty') return [];
    const membersInvites = membersState.invites.filter((membersInvite) => {
      if (membersState.inviteFilter === 'active') return membersInvite.status === membersStatusWaiting;
      if (membersState.inviteFilter === 'done') return membersInvite.status !== membersStatusWaiting;
      return true;
    });
    return membersInvites;
  }

  function membersStatusClass(membersStatus) {
    if (membersStatus === 'Активен' || membersStatus === 'Подключён' || membersStatus === membersStatusAccepted) return 'members-status-success';
    if (membersStatus === membersStatusWaiting || membersStatus === 'Не подключён') return 'members-status-warning';
    if (membersStatus === membersStatusRejected) return 'members-status-neutral';
    if (membersStatus === membersStatusExpired || membersStatus === membersStatusRevoked) return 'members-status-neutral';
    return '';
  }

  function membersActionIcon(membersType) {
    if (membersType === 'copy') return '<svg class="members-icon" aria-hidden="true" viewBox="0 0 24 24"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>';
    if (membersType === 'transfer') return '<svg class="members-icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M17 3v6h-6" /><path d="M7 21v-6h6" /><path d="M17 9a7 7 0 0 0-11.8-3.2" /><path d="M7 15a7 7 0 0 0 11.8 3.2" /></svg>';
    if (membersType === 'remove') return '<svg class="members-icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /></svg>';
    if (membersType === 'show') return '<svg class="members-icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z" /><circle cx="12" cy="12" r="3" /></svg>';
    return '<svg class="members-icon" aria-hidden="true" viewBox="0 0 24 24"><path d="M5 12h14" /></svg>';
  }

  function membersRender() {
    if (!membersRoot.isConnected || !membersEls.header || !membersEls.content || !membersEls.accessDenied || !membersEls.errorPanel) return;
    const membersNoAccess = membersState.mode === 'no-access';
    const membersError = membersState.mode === 'error';
    const membersLoading = membersState.mode === 'loading';
    const membersVisibleMembers = membersGetVisibleMembers();

    membersEls.header.hidden = membersNoAccess || membersError;
    membersEls.content.hidden = membersNoAccess || membersError;
    membersEls.accessDenied.hidden = !membersNoAccess;
    membersEls.errorPanel.hidden = !membersError;
    membersEls.offlinePanel.hidden = membersState.mode !== 'offline';
    membersEls.readonlyNote.hidden = !membersIsReadOnlyMode();
    membersEls.inviteButton.hidden = !membersCanManage() || membersLoading;
    membersEls.inviteSection.hidden = membersState.mode === 'participant' || membersState.mode === 'offline' || membersLoading;
    membersEls.count.textContent = membersPlural(membersVisibleMembers.length);

    membersRenderFilterButtons();
    membersRenderSystemState();
    membersRenderMembers();
    membersRenderInvites();
  }

  function membersRenderFilterButtons() {
    membersRoot.querySelectorAll('[data-members-filter]').forEach((membersButton) => {
      membersButton.setAttribute('aria-pressed', membersButton.getAttribute('data-members-filter') === membersState.inviteFilter ? 'true' : 'false');
    });
  }

  function membersRenderSystemState() {
    membersEls.listState.innerHTML = '';
    membersEls.inviteState.innerHTML = '';

    if (membersState.mode === 'loading') {
      membersEls.listState.innerHTML = membersSkeletonMarkup();
      membersEls.inviteState.innerHTML = membersSkeletonMarkup(2);
    }
  }

  function membersSkeletonMarkup(membersCount = 4) {
    return `<div class="members-skeleton-list" aria-label="Загрузка">${Array.from({ length: membersCount }).map(() => `
      <div class="members-skeleton-row">
        <span class="members-skeleton members-skeleton-avatar"></span>
        <span class="members-skeleton members-skeleton-text"></span>
        <span class="members-skeleton members-skeleton-text"></span>
        <span class="members-skeleton members-skeleton-text"></span>
      </div>`).join('')}</div>`;
  }

  function membersRenderMembers() {
    if (membersState.mode === 'loading' || membersState.mode === 'error' || membersState.mode === 'no-access') {
      membersEls.list.innerHTML = '';
      return;
    }

    const membersVisibleMembers = membersGetVisibleMembers();
    const membersShowActions = membersCanManage();
    const membersIsEmpty = membersState.mode === 'empty';

    membersEls.list.innerHTML = membersVisibleMembers.map((membersMember) => {
      const membersCanShowMemberActions = membersShowActions && membersMember.role !== membersRoleOrganizer;
      const membersRowClass = membersCanShowMemberActions ? 'members-row' : 'members-row members-row-no-actions';
      return `
        <article class="${membersRowClass}" tabindex="-1" data-member-id="${membersEscape(membersMember.id)}" data-od-id="member-row-${membersEscape(membersMember.id)}">
          <div class="members-person">
            <span class="members-avatar members-avatar-tone-${membersEscape(membersMember.tone)}" aria-hidden="true">${membersEscape(membersMember.initials)}</span>
            <div class="members-person-main">
              <div class="members-name-line">
                <span class="members-name">${membersEscape(membersMember.name)}</span>
                ${membersMember.isCurrent ? '<span class="members-you">Вы</span>' : ''}
              </div>
              <div class="members-joined">Присоединился: ${membersEscape(membersMember.joined)}</div>
            </div>
          </div>
          <div class="members-role-cell">
            <span class="members-cell-label">Роль</span>
            <span class="members-cell-value">${membersEscape(membersMember.role)}</span>
          </div>
          <div class="members-access-cell">
            <span class="members-cell-label">Доступ</span>
            <span class="members-status ${membersStatusClass(membersMember.access)}">${membersEscape(membersMember.access)}</span>
          </div>
          <div class="members-telegram-cell">
            <span class="members-cell-label">Telegram</span>
            <span class="members-status ${membersStatusClass(membersMember.telegram)}">${membersEscape(membersMember.telegram)}</span>
          </div>
          ${membersCanShowMemberActions ? membersMemberActionsMarkup(membersMember) : ''}
        </article>`;
    }).join('');

    if (membersIsEmpty) {
      membersEls.list.insertAdjacentHTML('beforeend', `
        <div class="members-empty">
          <span class="members-empty-title">В поездке пока нет других участников.</span>
          <span class="members-empty-text">Организатор может создать одноразовую ссылку и пригласить первого участника.</span>
          <button class="members-button members-button-primary" type="button" data-members-action="open-invite-inline">Пригласить участника</button>
        </div>`);
    }
  }

  function membersMemberActionsMarkup(membersMember) {
    return `
      <div class="members-row-actions">
        <div class="members-action-wrap">
          <button class="members-icon-button" type="button" data-members-action="toggle-member-menu" data-member-id="${membersEscape(membersMember.id)}" aria-label="Действия для ${membersEscape(membersMember.name)}" aria-expanded="${membersState.menuOpenFor === membersMember.id ? 'true' : 'false'}">
            <svg class="members-icon" aria-hidden="true" viewBox="0 0 24 24"><circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" /></svg>
          </button>
          ${membersState.menuOpenFor === membersMember.id ? membersMenuMarkup(membersMember) : ''}
        </div>
      </div>`;
  }

  function membersMenuMarkup(membersMember) {
    return `
      <div class="members-menu" role="menu">
        <button class="members-menu-button" type="button" role="menuitem" data-members-action="open-transfer" data-member-id="${membersEscape(membersMember.id)}">${membersActionIcon('transfer')}<span>Передать роль организатора</span></button>
        <button class="members-menu-button members-menu-button-danger" type="button" role="menuitem" data-members-action="open-remove" data-member-id="${membersEscape(membersMember.id)}">${membersActionIcon('remove')}<span>Удалить из поездки</span></button>
      </div>`;
  }

  function membersRenderInvites() {
    if (membersState.mode === 'loading' || membersState.mode === 'error' || membersState.mode === 'no-access' || membersEls.inviteSection.hidden) {
      membersEls.inviteList.innerHTML = '';
      return;
    }

    const membersVisibleInvites = membersGetVisibleInvites();

    if (!membersVisibleInvites.length) {
      const membersEmptyTitle = membersState.mode === 'empty'
        ? 'Приглашений пока нет'
        : 'Приглашений в этом фильтре нет';
      membersEls.inviteList.innerHTML = `<div class="members-empty"><span class="members-empty-title">${membersEmptyTitle}</span><span class="members-empty-text">Создайте одноразовую ссылку, когда нужно добавить нового участника.</span></div>`;
      return;
    }

    membersEls.inviteList.innerHTML = membersVisibleInvites.map((membersInvite) => `
      <article class="members-invite-row" tabindex="-1" data-invite-id="${membersEscape(membersInvite.id)}" data-od-id="invite-row-${membersEscape(membersInvite.id)}">
        <div class="members-invite-recipient">
          <div class="members-email">${membersEscape(membersInvite.recipient || 'Получатель не указан')}</div>
          <button class="members-link-toggle" type="button" data-members-action="toggle-link" data-invite-id="${membersEscape(membersInvite.id)}" aria-expanded="false">Показать ссылку</button>
          <div class="members-invite-link" id="members-link-${membersEscape(membersInvite.id)}">${membersEscape(membersInvite.link)}</div>
        </div>
        <div class="members-invite-status">
          <span class="members-cell-label">Статус</span>
          <span class="members-status ${membersStatusClass(membersInvite.status)}">${membersEscape(membersInvite.status)}</span>
        </div>
        <div class="members-invite-created">
          <span class="members-cell-label">Создано</span>
          <span class="members-cell-value">${membersEscape(membersInvite.created)}</span>
        </div>
        <div class="members-invite-expires">
          <span class="members-cell-label">${membersEscape(membersInvite.expiresPrefix)}</span>
          <span class="members-cell-value">${membersEscape(membersInvite.expiresLabel)}</span>
        </div>
        <div class="members-invite-actions">
          ${membersInviteActionsMarkup(membersInvite)}
        </div>
      </article>`).join('');
  }

  function membersInviteActionsMarkup(membersInvite) {
    if (membersInvite.status === membersStatusWaiting) {
      return `
        <button class="members-text-action" type="button" data-members-action="copy-invite" data-invite-id="${membersEscape(membersInvite.id)}">${membersActionIcon('copy')}<span>Копировать ссылку</span></button>
        <button class="members-text-action members-text-action-danger" type="button" data-members-action="open-revoke" data-invite-id="${membersEscape(membersInvite.id)}">${membersActionIcon('remove')}<span>Отозвать приглашение</span></button>`;
    }

    return `
      <button class="members-text-action" type="button" data-members-action="renew-invite" data-invite-id="${membersEscape(membersInvite.id)}">${membersActionIcon('copy')}<span>Создать новое приглашение</span></button>
      <button class="members-text-action members-text-action-danger" type="button" data-members-action="open-delete-invite" data-invite-id="${membersEscape(membersInvite.id)}">${membersActionIcon('remove')}<span>Удалить запись</span></button>`;
  }

  function membersOpenModal({ membersTitle, membersDesc, membersBody, membersFoot, membersOnOpen }) {
    membersState.lastFocus = document.activeElement;
    membersEls.modalTitle.textContent = membersTitle;
    membersEls.modalDesc.textContent = membersDesc || '';
    membersEls.modalBody.innerHTML = membersBody;
    membersEls.modalFoot.innerHTML = membersFoot;
    membersEls.modalLayer.classList.add('members-open');
    membersEls.modalLayer.setAttribute('aria-hidden', 'false');
    membersEls.modalClose.focus();
    membersTrapFocus(membersEls.modalLayer);
    if (typeof membersOnOpen === 'function') membersOnOpen();
  }

  function membersCloseModal(membersOptions = {}) {
    const membersShouldRestore = membersOptions.restoreFocus !== false;
    membersEls.modalLayer.classList.remove('members-open');
    membersEls.modalLayer.setAttribute('aria-hidden', 'true');
    membersEls.modalBody.innerHTML = '';
    membersEls.modalFoot.innerHTML = '';
    membersEls.modalLayer.onkeydown = null;
    if (membersShouldRestore) membersRestoreFocus();
  }

  function membersOpenInviteModal(membersPrefillEmail = '') {
    if (!membersCanManage()) return;
    membersState.generatedInvite = null;
    membersOpenModal({
      membersTitle: 'Пригласить участника',
      membersDesc: 'Участник получит доступ только для просмотра.',
      membersBody: membersInviteModalBody(membersPrefillEmail),
      membersFoot: `
        <button class="members-button members-button-secondary" type="button" data-members-close="modal">Отмена</button>
        <button class="members-button members-button-primary" type="button" data-members-action="create-invite">Создать ссылку</button>
      `,
    });
  }

  function membersInviteModalBody(membersPrefillEmail = '') {
    return `
      <div class="members-field">
        <label for="members-invite-email">Email участника — необязательно</label>
        <input class="members-input" id="members-invite-email" type="email" value="${membersEscape(membersPrefillEmail)}" placeholder="name@example.com" aria-describedby="members-invite-email-hint members-invite-email-error" />
        <span class="members-field-hint" id="members-invite-email-hint">Email используется только как подпись приглашения. В демонстрационной версии письмо автоматически не отправляется.</span>
        <span class="members-field-error" id="members-invite-email-error" hidden></span>
      </div>
      <div class="members-field">
        <span class="members-field-title">Срок действия приглашения</span>
        <div class="members-choice-grid" role="radiogroup" aria-label="Срок действия приглашения">
          <label class="members-choice"><input type="radio" name="members-expiry" value="24" />24 часа</label>
          <label class="members-choice"><input type="radio" name="members-expiry" value="72" />3 дня</label>
          <label class="members-choice"><input type="radio" name="members-expiry" value="168" checked />7 дней</label>
        </div>
      </div>
      <div id="members-generated-invite"></div>`;
  }

  function membersValidateEmail(membersEmail) {
    if (!membersEmail) return true;
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(membersEmail);
  }

  function membersCreateInvite() {
    if (membersState.generatedInvite) return;

    const membersEmailInput = membersRoot.querySelector('#members-invite-email');
    const membersEmailError = membersRoot.querySelector('#members-invite-email-error');
    const membersEmail = membersEmailInput ? membersEmailInput.value.trim() : '';

    if (!membersValidateEmail(membersEmail)) {
      membersEmailInput.setAttribute('aria-invalid', 'true');
      membersEmailError.hidden = false;
      membersEmailError.textContent = 'Введите корректный email или оставьте поле пустым.';
      membersEmailInput.focus();
      return;
    }

    if (membersEmailInput) membersEmailInput.setAttribute('aria-invalid', 'false');
    if (membersEmailError) membersEmailError.hidden = true;

    const membersSelected = membersRoot.querySelector('input[name="members-expiry"]:checked');
    const membersHours = membersSelected ? Number(membersSelected.value) : 168;
    const membersCreated = new Date(Date.UTC(2026, 6, 17, 9, 30 + membersState.inviteSequence));
    const membersExpires = new Date(membersCreated.getTime() + membersHours * 60 * 60 * 1000);
    const membersCreatedLabel = membersFormatDateTime(membersCreated);
    const membersExpiresLabel = membersFormatDateTime(membersExpires);
    const membersLink = `https://travel.local/invite/${Math.random().toString(36).slice(2, 8)}-turkey-2026`;
    const membersInvite = {
      id: `invite-local-${Date.now()}-${membersState.inviteSequence}`,
      recipient: membersEmail || 'Получатель не указан',
      email: membersEmail,
      status: membersStatusWaiting,
      created: membersCreatedLabel,
      expiresLabel: membersExpiresLabel,
      expiresPrefix: 'Истекает',
      active: true,
      link: membersLink,
    };

    membersState.inviteSequence += 1;
    membersState.generatedInvite = membersInvite;
    membersState.invites.unshift(membersInvite);
    membersState.inviteFilter = 'all';
    membersCommitShared();
    membersRender();

    const membersTarget = membersRoot.querySelector('#members-generated-invite');
    if (membersTarget) {
      membersTarget.innerHTML = `
        <div class="members-generated-link" role="status">
          <div class="members-cell-value">${membersEscape(membersInvite.recipient)}</div>
          <div class="members-link-box" id="members-generated-link-text">${membersEscape(membersLink)}</div>
          <div class="members-cell-value">Истекает: ${membersEscape(membersExpiresLabel)}</div>
          <div class="members-copy-success" id="members-copy-generated-status" hidden>Ссылка скопирована.</div>
          <div class="members-copy-error" id="members-copy-generated-error" hidden>Не удалось скопировать ссылку. Выделите и скопируйте её вручную.</div>
          <div class="members-empty-text">Ссылка предназначена для одного пользователя и перестанет действовать после принятия.</div>
        </div>`;
    }

    membersEls.modalFoot.innerHTML = `
      <button class="members-button members-button-secondary" type="button" data-members-action="copy-generated">${membersActionIcon('copy')}<span>Копировать ссылку</span></button>
      <button class="members-button members-button-primary" type="button" data-members-close="modal">Готово</button>
    `;
    membersTrapFocus(membersEls.modalLayer);
    membersToast('Приглашение создано.', 'success');
  }

  function membersFormatDateTime(membersDate) {
    return new Intl.DateTimeFormat('ru-RU', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Europe/Moscow',
    }).format(membersDate).replace(' г. в', ',');
  }

  function membersOpenRevokeModal(membersInviteId) {
    membersState.pendingInviteId = membersInviteId;
    membersOpenModal({
      membersTitle: 'Отозвать приглашение',
      membersDesc: '',
      membersBody: '<p class="members-empty-text">Отозвать это приглашение? Ссылка сразу перестанет работать.</p>',
      membersFoot: `
        <button class="members-button members-button-secondary" type="button" data-members-close="modal">Отмена</button>
        <button class="members-button members-button-danger" type="button" data-members-action="confirm-revoke">Отозвать приглашение</button>
      `,
    });
  }

  function membersConfirmRevoke() {
    const membersInvite = membersGetInvite(membersState.pendingInviteId);
    if (!membersInvite) return;
    membersInvite.active = false;
    membersInvite.status = membersStatusRevoked;
    membersInvite.expiresPrefix = 'Отозвано';
    membersInvite.expiresLabel = '17 июля 2026, 12:35';
    membersCommitShared();
    membersCloseModal({ restoreFocus: false });
    membersToast('Приглашение отозвано.', 'warning');
    membersRender();
    membersFocusInvite(membersInvite.id);
  }

  function membersOpenRemoveModal(membersMemberId) {
    const membersMember = membersGetMember(membersMemberId);
    if (!membersMember) return;
    membersState.pendingMemberId = membersMemberId;
    membersOpenModal({
      membersTitle: 'Удалить из поездки',
      membersDesc: '',
      membersBody: `<p class="members-empty-text">Удалить участника: ${membersEscape(membersMember.name)}? После удаления пользователь потеряет доступ к маршруту, документам, Telegram-уведомлениям и сохранённой offline-копии.</p>`,
      membersFoot: `
        <button class="members-button members-button-secondary" type="button" data-members-close="modal">Отмена</button>
        <button class="members-button members-button-danger" type="button" data-members-action="confirm-remove">Удалить участника</button>
      `,
    });
  }

  function membersConfirmRemove() {
    const membersMember = membersGetMember(membersState.pendingMemberId);
    if (!membersMember || membersMember.role === membersRoleOrganizer) return;
    const membersRemoveIndex = membersState.members.findIndex((membersItem) => membersItem.id === membersMember.id);
    membersState.members = membersState.members.filter((membersItem) => membersItem.id !== membersMember.id);
    membersState.menuOpenFor = null;
    membersCommitShared();
    membersCloseModal({ restoreFocus: false });
    membersToast('Участник удалён из поездки.', 'danger');
    membersRender();
    membersFocusAfterMemberRemoval(membersRemoveIndex);
  }

  function membersOpenTransferModal(membersMemberId) {
    const membersMember = membersGetMember(membersMemberId);
    const membersCurrentOrganizer = membersState.members.find((membersItem) => membersItem.role === membersRoleOrganizer);
    if (!membersMember || !membersCurrentOrganizer || membersMember.id === membersCurrentOrganizer.id) return;
    membersState.pendingMemberId = membersMemberId;
    membersOpenModal({
      membersTitle: 'Передать роль организатора',
      membersDesc: 'Это действие меняет владельца поездки.',
      membersBody: `
        <div class="members-transfer-target">
          <span class="members-avatar members-avatar-tone-${membersEscape(membersMember.tone)}" aria-hidden="true">${membersEscape(membersMember.initials)}</span>
          <div>
            <div class="members-name">${membersEscape(membersMember.name)}</div>
            <div class="members-joined">Новый организатор</div>
          </div>
        </div>
        <ul class="members-impact-list">
          <li>Текущий организатор ${membersEscape(membersCurrentOrganizer.name)} станет участником, а ${membersEscape(membersMember.name)} получит полный контроль над поездкой.</li>
          <li>Новый организатор сможет управлять участниками, документами и Plan B.</li>
          <li>В поездке по-прежнему останется ровно один организатор.</li>
        </ul>
        <label class="members-check">
          <input type="checkbox" id="members-transfer-confirm" />
          <span>Я понимаю, что новый организатор сможет изменять поездку, управлять участниками, подтверждать нарушения, выбирать Plan B и завершать поездку.</span>
        </label>
      `,
      membersFoot: `
        <button class="members-button members-button-secondary" type="button" data-members-close="modal">Отмена</button>
        <button class="members-button members-button-primary" type="button" data-members-action="confirm-transfer" disabled>Передать роль</button>
      `,
      membersOnOpen: () => {
        const membersCheckbox = membersRoot.querySelector('#members-transfer-confirm');
        const membersSubmit = membersRoot.querySelector('[data-members-action="confirm-transfer"]');
        membersCheckbox.addEventListener('change', () => {
          membersSubmit.disabled = !membersCheckbox.checked;
        });
      },
    });
  }

  function membersConfirmTransfer() {
    const membersNextOrganizer = membersGetMember(membersState.pendingMemberId);
    const membersCurrentOrganizer = membersState.members.find((membersMember) => membersMember.role === membersRoleOrganizer);
    if (!membersNextOrganizer || !membersCurrentOrganizer || membersNextOrganizer.id === membersCurrentOrganizer.id) return;
    membersState.members.forEach((membersMember) => {
      membersMember.role = membersMember.id === membersNextOrganizer.id ? membersRoleOrganizer : membersRoleParticipant;
    });
    membersState.mode = 'participant';
    membersState.menuOpenFor = null;
    membersCommitShared({ currentUser: { currentTripRole: 'participant' } });
    membersCloseModal({ restoreFocus: false });
    membersToast('Роль организатора передана', 'success');
    membersSyncModeControls();
    membersRender();
    membersFocusMember(membersNextOrganizer.id);
  }

  function membersOpenDeleteInviteModal(membersInviteId) {
    membersState.pendingInviteId = membersInviteId;
    membersOpenModal({
      membersTitle: 'Удалить запись приглашения?',
      membersDesc: '',
      membersBody: '<p class="members-empty-text">Запись исчезнет из списка. Это не повлияет на участников поездки.</p>',
      membersFoot: `
        <button class="members-button members-button-secondary" type="button" data-members-close="modal">Отмена</button>
        <button class="members-button members-button-danger" type="button" data-members-action="confirm-delete-invite">Удалить запись</button>
      `,
    });
  }

  function membersConfirmDeleteInvite() {
    const membersDeleteIndex = membersState.invites.findIndex((membersInvite) => membersInvite.id === membersState.pendingInviteId);
    membersState.invites = membersState.invites.filter((membersInvite) => membersInvite.id !== membersState.pendingInviteId);
    membersCommitShared();
    membersCloseModal({ restoreFocus: false });
    membersToast('Запись приглашения удалена.', 'warning');
    membersRender();
    membersFocusAfterInviteRemoval(membersDeleteIndex);
  }

  function membersOpenRenewInvite(membersInviteId) {
    const membersInvite = membersGetInvite(membersInviteId);
    if (!membersInvite) return;
    membersOpenInviteModal(membersInvite.email || '');
  }

  async function membersCopyText(membersText) {
    if (navigator.clipboard && window.isSecureContext) {
      try {
        await navigator.clipboard.writeText(membersText);
        return true;
      } catch (membersClipboardError) {
        // Fall through to the textarea fallback.
      }
    }

    const membersTextarea = document.createElement('textarea');
    membersTextarea.value = membersText;
    membersTextarea.setAttribute('readonly', '');
    membersTextarea.style.position = 'fixed';
    membersTextarea.style.top = '-9999px';
    membersRoot.appendChild(membersTextarea);
    membersTextarea.select();

    let membersCopied = false;
    try {
      membersCopied = document.execCommand('copy');
    } catch (membersFallbackError) {
      membersCopied = false;
    }
    membersTextarea.remove();
    return membersCopied;
  }

  async function membersCopyInvite(membersInviteId) {
    const membersInvite = membersGetInvite(membersInviteId);
    if (!membersInvite) return;
    const membersCopied = await membersCopyText(membersInvite.link);
    membersToast(membersCopied ? 'Ссылка скопирована.' : 'Не удалось скопировать ссылку. Выделите и скопируйте её вручную.', membersCopied ? 'success' : 'danger');
    if (!membersCopied) {
      membersShowInviteLink(membersInviteId, true);
    }
  }

  async function membersCopyGenerated() {
    if (!membersState.generatedInvite) return;
    const membersCopied = await membersCopyText(membersState.generatedInvite.link);
    const membersSuccess = membersRoot.querySelector('#members-copy-generated-status');
    const membersError = membersRoot.querySelector('#members-copy-generated-error');
    if (membersSuccess) membersSuccess.hidden = !membersCopied;
    if (membersError) membersError.hidden = membersCopied;
    membersToast(membersCopied ? 'Ссылка скопирована.' : 'Не удалось скопировать ссылку. Выделите и скопируйте её вручную.', membersCopied ? 'success' : 'danger');
  }

  function membersShowInviteLink(membersInviteId, membersForceOpen = false) {
    const membersLink = membersRoot.querySelector(`#members-link-${CSS.escape(membersInviteId)}`);
    const membersButton = membersRoot.querySelector(`[data-members-action="toggle-link"][data-invite-id="${membersInviteId}"]`);
    if (!membersLink || !membersButton) return;
    const membersWillOpen = membersForceOpen || !membersLink.classList.contains('members-open');
    membersLink.classList.toggle('members-open', membersWillOpen);
    membersButton.setAttribute('aria-expanded', membersWillOpen ? 'true' : 'false');
    membersButton.textContent = membersWillOpen ? 'Скрыть ссылку' : 'Показать ссылку';
  }

  function membersToast(membersMessage, membersTone = 'info') {
    const membersToastNode = document.createElement('div');
    membersToastNode.className = `members-toast members-toast-${membersTone}`;
    membersToastNode.setAttribute('role', 'status');
    membersToastNode.textContent = membersMessage;
    membersEls.toastStack.appendChild(membersToastNode);
    window.setTimeout(() => membersToastNode.remove(), 3200);
  }

  function membersSetMode(membersMode) {
    membersState.mode = membersMode;
    membersState.menuOpenFor = null;
    membersRender();
  }

  function membersResetDemoData() {
    if (window.TravelAppState) {
      window.TravelAppState.resetDemoData();
      membersToast('Демо-данные восстановлены.', 'success');
      return;
    }
    const membersFallbackSeed = membersReadShared();
    membersState.mode = 'organizer';
    membersState.inviteFilter = 'all';
    membersState.members = membersFallbackSeed.membersMembers;
    membersState.invites = membersFallbackSeed.membersInvites;
    membersState.menuOpenFor = null;
    membersState.pendingMemberId = null;
    membersState.pendingInviteId = null;
    membersState.generatedInvite = null;
    membersState.inviteSequence = 1;
    membersSyncModeControls();
    membersRender();
    membersToast('Демо-данные восстановлены.', 'success');
  }

  function membersSyncModeControls() {
    const membersModeControl = membersRoot.querySelector(`input[name="members-mode"][value="${membersState.mode}"]`);
    if (membersModeControl) membersModeControl.checked = true;
  }

  function membersOpenSheetForMember(membersMemberId) {
    const membersMember = membersGetMember(membersMemberId);
    if (!membersMember || membersMember.role === membersRoleOrganizer) return;
    membersState.lastFocus = document.activeElement;
    membersEls.sheetActions.innerHTML = `
      <button class="members-sheet-action" type="button" data-members-action="open-transfer" data-member-id="${membersEscape(membersMember.id)}">${membersActionIcon('transfer')}<span>Передать роль организатора</span></button>
      <button class="members-sheet-action members-sheet-action-danger" type="button" data-members-action="open-remove" data-member-id="${membersEscape(membersMember.id)}">${membersActionIcon('remove')}<span>Удалить из поездки</span></button>`;
    membersEls.sheet.classList.add('members-open');
    membersEls.sheet.setAttribute('aria-hidden', 'false');
    const membersFirstButton = membersEls.sheet.querySelector('button');
    if (membersFirstButton) membersFirstButton.focus();
    membersTrapFocus(membersEls.sheet);
  }

  function membersCloseSheet(membersOptions = {}) {
    const membersShouldRestore = membersOptions.restoreFocus !== false;
    membersEls.sheet.classList.remove('members-open');
    membersEls.sheet.setAttribute('aria-hidden', 'true');
    membersEls.sheetActions.innerHTML = '';
    membersEls.sheet.onkeydown = null;
    if (membersShouldRestore) membersRestoreFocus();
  }

  function membersTrapFocus(membersContainer) {
    const membersFocusableItems = membersFocusable(membersContainer);
    if (!membersFocusableItems.length) return;
    const membersFirst = membersFocusableItems[0];
    const membersLast = membersFocusableItems[membersFocusableItems.length - 1];
    membersContainer.onkeydown = (membersEvent) => {
      if (membersEvent.key !== 'Tab') return;
      if (membersEvent.shiftKey && document.activeElement === membersFirst) {
        membersEvent.preventDefault();
        membersLast.focus();
      } else if (!membersEvent.shiftKey && document.activeElement === membersLast) {
        membersEvent.preventDefault();
        membersFirst.focus();
      }
    };
  }

  function membersFocusable(membersContainer) {
    return Array.from(membersContainer.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'))
      .filter((membersElement) => !membersElement.disabled && membersElement.offsetParent !== null);
  }

  function membersRestoreFocus() {
    if (membersState.lastFocus && document.contains(membersState.lastFocus) && typeof membersState.lastFocus.focus === 'function') {
      membersState.lastFocus.focus();
    }
    membersState.lastFocus = null;
  }

  function membersFocusMember(membersMemberId) {
    const membersRow = membersRoot.querySelector(`[data-member-id="${membersMemberId}"]`);
    if (membersRow) membersRow.focus();
  }

  function membersFocusInvite(membersInviteId) {
    const membersRow = membersRoot.querySelector(`[data-invite-id="${membersInviteId}"]`);
    if (membersRow) membersRow.focus();
  }

  function membersFocusAfterMemberRemoval(membersRemoveIndex) {
    const membersVisibleMembers = membersGetVisibleMembers();
    const membersTarget = membersVisibleMembers[membersRemoveIndex] || membersVisibleMembers[membersRemoveIndex - 1];
    if (membersTarget) {
      membersFocusMember(membersTarget.id);
      return;
    }
    if (!membersEls.inviteButton.hidden) {
      membersEls.inviteButton.focus();
      return;
    }
    membersRoot.querySelector('#members-trip-title').focus();
  }

  function membersFocusAfterInviteRemoval(membersDeleteIndex) {
    const membersVisibleInvites = membersGetVisibleInvites();
    const membersTarget = membersVisibleInvites[membersDeleteIndex] || membersVisibleInvites[membersDeleteIndex - 1];
    if (membersTarget) {
      membersFocusInvite(membersTarget.id);
      return;
    }
    membersRoot.querySelector('#members-invitations-title').focus();
  }

  function membersHandleClick(membersEvent) {
    const membersTarget = membersEvent.target.closest('[data-members-action], [data-members-close], [data-members-filter]');
    if (!membersTarget || !membersRoot.contains(membersTarget)) return;

    const membersCloseTarget = membersTarget.getAttribute('data-members-close');
    if (membersCloseTarget === 'modal') {
      membersCloseModal();
      return;
    }
    if (membersCloseTarget === 'sheet') {
      membersCloseSheet();
      return;
    }

    const membersFilter = membersTarget.getAttribute('data-members-filter');
    if (membersFilter) {
      membersState.inviteFilter = membersFilter;
      membersRender();
      return;
    }

    const membersAction = membersTarget.getAttribute('data-members-action');
    const membersMemberId = membersTarget.getAttribute('data-member-id');
    const membersInviteId = membersTarget.getAttribute('data-invite-id');

    if (membersAction === 'toggle-member-menu') {
      const membersSmallScreen = window.matchMedia('(max-width: 600px)').matches;
      if (membersSmallScreen) {
        membersOpenSheetForMember(membersMemberId);
        return;
      }
      membersState.menuOpenFor = membersState.menuOpenFor === membersMemberId ? null : membersMemberId;
      membersRender();
      return;
    }

    if (membersAction === 'open-invite-inline') {
      membersOpenInviteModal();
      return;
    }

    if (membersAction === 'open-transfer') {
      membersCloseSheet({ restoreFocus: false });
      membersState.menuOpenFor = null;
      membersRender();
      membersOpenTransferModal(membersMemberId);
      return;
    }

    if (membersAction === 'open-remove') {
      membersCloseSheet({ restoreFocus: false });
      membersState.menuOpenFor = null;
      membersRender();
      membersOpenRemoveModal(membersMemberId);
      return;
    }

    if (membersAction === 'copy-invite') {
      membersCopyInvite(membersInviteId);
      return;
    }

    if (membersAction === 'toggle-link') {
      membersShowInviteLink(membersInviteId);
      return;
    }

    if (membersAction === 'open-revoke') {
      membersOpenRevokeModal(membersInviteId);
      return;
    }

    if (membersAction === 'renew-invite') {
      membersOpenRenewInvite(membersInviteId);
      return;
    }

    if (membersAction === 'open-delete-invite') {
      membersOpenDeleteInviteModal(membersInviteId);
      return;
    }

    if (membersAction === 'create-invite') {
      membersCreateInvite();
      return;
    }

    if (membersAction === 'copy-generated') {
      membersCopyGenerated();
      return;
    }

    if (membersAction === 'confirm-revoke') {
      membersConfirmRevoke();
      return;
    }

    if (membersAction === 'confirm-remove') {
      membersConfirmRemove();
      return;
    }

    if (membersAction === 'confirm-transfer') {
      membersConfirmTransfer();
      return;
    }

    if (membersAction === 'confirm-delete-invite') {
      membersConfirmDeleteInvite();
    }
  }

  function membersHandleDocumentClick(membersEvent) {
    if (!membersEvent.target.closest('.members-action-wrap') && membersState.menuOpenFor) {
      membersState.menuOpenFor = null;
      membersRender();
    }
  }

  function membersHandleKeydown(membersEvent) {
    if (membersEvent.key === 'Escape') {
      if (membersEls.modalLayer.classList.contains('members-open')) membersCloseModal();
      if (membersEls.sheet.classList.contains('members-open')) membersCloseSheet();
      if (membersState.menuOpenFor) {
        membersState.menuOpenFor = null;
        membersRender();
      }
    }
  }

  const membersBoundListeners = [];

  function membersOn(membersTarget, membersType, membersHandler) {
    if (!membersTarget) return;
    membersTarget.addEventListener(membersType, membersHandler);
    membersBoundListeners.push({ membersTarget, membersType, membersHandler });
  }

  function membersBindEvents() {
    membersOn(membersRoot, 'click', membersHandleClick);
    membersOn(document, 'click', membersHandleDocumentClick);
    membersOn(document, 'keydown', membersHandleKeydown);
    membersOn(membersEls.inviteButton, 'click', () => membersOpenInviteModal());
    membersOn(membersEls.modalClose, 'click', () => membersCloseModal());
    membersOn(membersEls.resetButton, 'click', membersResetDemoData);
    membersOn(membersEls.retryButton, 'click', () => membersSetMode('organizer'));
    membersOn(membersEls.homeButton, 'click', () => membersToast('Переход на Главную доступен в основной версии.', 'info'));
    membersRoot.querySelectorAll('input[name="members-mode"]').forEach((membersInput) => {
      membersOn(membersInput, 'change', () => membersSetMode(membersInput.value));
    });
  }

  function membersTeardownInstance() {
    if (membersEls.modalLayer && membersEls.modalLayer.classList.contains('members-open')) membersCloseModal();
    if (membersEls.sheet && membersEls.sheet.classList.contains('members-open')) membersCloseSheet();
    if (membersState.menuOpenFor) {
      membersState.menuOpenFor = null;
      membersRender();
    }
    membersBoundListeners.forEach(({ membersTarget, membersType, membersHandler }) => {
      membersTarget.removeEventListener(membersType, membersHandler);
    });
    membersBoundListeners.length = 0;
    if (window.TravelAppState) window.TravelAppState.unsubscribe(membersHandleSharedChange);
  }

  membersBindEvents();
  membersRender();
  if (window.TravelAppState) window.TravelAppState.subscribe(membersHandleSharedChange);

  return {
    membersRoot,
    membersSetMode,
    membersResetDemoData,
    membersRender,
    membersState,
    membersOpenInviteModal,
    membersTeardown: membersTeardownInstance,
  };
  }

  function membersInit(membersRootElement) {
    const membersRoot = membersRootElement || document.querySelector('.members-surface[data-feature="trip-members"]');
    if (!membersRoot) return null;
    const membersExisting = membersInstances.get(membersRoot);
    if (membersExisting) return membersExisting;
    const membersInstance = membersCreateInstance(membersRoot);
    membersInstances.set(membersRoot, membersInstance);
    return membersInstance;
  }

  function membersDestroy(membersRootElement) {
    const membersRoot = membersRootElement || document.querySelector('.members-surface[data-feature="trip-members"]');
    if (!membersRoot) return;
    const membersInstance = membersInstances.get(membersRoot);
    if (!membersInstance) return;
    membersInstance.membersTeardown();
    membersInstances.delete(membersRoot);
  }

  window.membersInit = membersInit;
  window.membersDestroy = membersDestroy;
  window.membersTripMembers = { membersInit, membersDestroy };

  // Единая точка открытия окна приглашения — её же вызывает глобальная кнопка шапки.
  window.membersOpenInviteModal = function membersOpenInviteModalGlobal(membersPrefillEmail) {
    const membersInstance = membersInit();
    if (membersInstance && typeof membersInstance.membersOpenInviteModal === 'function') {
      membersInstance.membersOpenInviteModal(membersPrefillEmail || '');
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function membersDomReady() {
      membersInit();
    }, { once: true });
  } else {
    membersInit();
  }
}());

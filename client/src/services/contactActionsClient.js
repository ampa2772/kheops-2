import apiClient from './apiClient';

const prefix = '/api/contact-actions';

export const getContactActionContext = async (contactId) => {
  const { data } = await apiClient.get(`${prefix}/${encodeURIComponent(contactId)}/context`);
  return data;
};

export const createContactEmailDraft = async (contactId, payload = {}) => {
  const { data } = await apiClient.post(
    `${prefix}/${encodeURIComponent(contactId)}/email-drafts`,
    payload,
  );
  return data;
};

export const createContactLetter = async (contactId, payload) => {
  const idempotencyKey = payload?.idempotencyKey;
  const { data } = await apiClient.post(
    `${prefix}/${encodeURIComponent(contactId)}/letters`,
    payload,
    { headers: idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : undefined },
  );
  return data?.letter;
};

const contactActionsClient = {
  getContext: getContactActionContext,
  createEmailDraft: createContactEmailDraft,
  createLetter: createContactLetter,
};

export default contactActionsClient;

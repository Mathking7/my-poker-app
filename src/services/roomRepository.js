import {
  collection,
  deleteDoc,
  deleteField,
  doc,
  getDoc,
  getDocs,
  onSnapshot,
  runTransaction,
  setDoc,
} from 'firebase/firestore';

import { db, globalAppId } from '../firebase';

export const getRoomsCollectionRef = () => {
  return collection(db, 'artifacts', globalAppId, 'public', 'data', 'rooms');
};

export const getRoomDocRef = (roomId) => {
  return doc(db, 'artifacts', globalAppId, 'public', 'data', 'rooms', roomId);
};

export const getPublicRoomIndexCollectionRef = () => {
  return collection(db, 'artifacts', globalAppId, 'public', 'data', 'publicRoomIndex');
};

export const getPublicRoomIndexDocRef = (roomId) => {
  return doc(db, 'artifacts', globalAppId, 'public', 'data', 'publicRoomIndex', roomId);
};

export const getUserRoomHistoryCollectionRef = (uid) => {
  return collection(db, 'artifacts', globalAppId, 'users', uid, 'roomHistory');
};

export const getUserRoomHistoryDocRef = (uid, roomId) => {
  return doc(db, 'artifacts', globalAppId, 'users', uid, 'roomHistory', roomId);
};

const resolveRoomTarget = (roomTarget) => {
  return typeof roomTarget === 'string' ? getRoomDocRef(roomTarget) : roomTarget;
};

export const getRoomsSnapshot = () => getDocs(getRoomsCollectionRef());

export const getRoomSnapshot = (roomId) => getDoc(getRoomDocRef(roomId));

export const getPublicRoomIndexSnapshot = () => getDocs(getPublicRoomIndexCollectionRef());

export const getUserRoomHistorySnapshot = (uid) => getDocs(getUserRoomHistoryCollectionRef(uid));

export const getUserRoomHistoryDocument = (uid, roomId) => getDoc(getUserRoomHistoryDocRef(uid, roomId));

export const subscribeRoom = (roomId, onNext, onError) => {
  return onSnapshot(getRoomDocRef(roomId), onNext, onError);
};

export const subscribeUserRoomHistoryDocument = (uid, roomId, onNext, onError) => {
  return onSnapshot(getUserRoomHistoryDocRef(uid, roomId), onNext, onError);
};

export const setRoomDocument = (roomTarget, data, options) => {
  return setDoc(resolveRoomTarget(roomTarget), data, options);
};

export const mergeRoomDocument = (roomTarget, patch) => {
  return setRoomDocument(roomTarget, patch, { merge: true });
};

export const deleteRoomDocument = (roomTarget) => {
  return deleteDoc(resolveRoomTarget(roomTarget));
};

export const setPublicRoomIndexDocument = (roomId, data, options) => {
  return setDoc(getPublicRoomIndexDocRef(roomId), data, options);
};

export const deletePublicRoomIndexDocument = (roomId) => {
  return deleteDoc(getPublicRoomIndexDocRef(roomId));
};

export const setUserRoomHistoryDocument = (uid, roomId, data, options = { merge: true }) => {
  return setDoc(getUserRoomHistoryDocRef(uid, roomId), data, options);
};

export const deleteUserRoomHistoryDocument = (uid, roomId) => {
  return deleteDoc(getUserRoomHistoryDocRef(uid, roomId));
};

export const runRoomTransaction = (roomId, handler) => {
  return runTransaction(db, async (transaction) => {
    const roomRef = getRoomDocRef(roomId);
    return handler(transaction, roomRef);
  });
};

export const deleteFieldValue = deleteField;

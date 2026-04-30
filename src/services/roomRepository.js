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

const resolveRoomTarget = (roomTarget) => {
  return typeof roomTarget === 'string' ? getRoomDocRef(roomTarget) : roomTarget;
};

export const getRoomsSnapshot = () => getDocs(getRoomsCollectionRef());

export const getRoomSnapshot = (roomId) => getDoc(getRoomDocRef(roomId));

export const subscribeRoom = (roomId, onNext, onError) => {
  return onSnapshot(getRoomDocRef(roomId), onNext, onError);
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

export const runRoomTransaction = (roomId, handler) => {
  return runTransaction(db, async (transaction) => {
    const roomRef = getRoomDocRef(roomId);
    return handler(transaction, roomRef);
  });
};

export const deleteFieldValue = deleteField;

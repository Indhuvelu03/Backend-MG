// utils/responseHandler.js
export const sendSuccess = (res, message, data, statusCode = 200) => {
  const envelope = {
    success: true,
    message,
    data,
  };
  return res.status(statusCode).json(envelope);
};

export const sendError = (res, message, statusCode = 500, errors) => {
  const envelope = {
    success: false,
    message,
    errors: errors || {},
  };
  return res.status(statusCode).json(envelope);
};
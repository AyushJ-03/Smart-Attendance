const requireAuth = (req, res, next) => {
  if (!req.session.user) {
    return res.redirect('/auth/login');
  }
  next();
};

const requireRole = (role) => {
  return (req, res, next) => {
    if (!req.session.user || req.session.user.role !== role) {
      return res.status(403).render('error', { 
        message: 'Access denied',
        error: { status: 403 }
      });
    }
    next();
  };
};

module.exports = { requireAuth, requireRole };
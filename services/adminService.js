const { getDatabase } = require('../database/db');

class AdminService {
  constructor() {
    this.db = getDatabase();
  }

  /**
   * Add a new admin
   * @param {number} userId - Telegram user ID
   * @param {string} role - Role (owner, admin, support)
   * @returns {object} Result
   */
  addAdmin(userId, role = 'support') {
    try {
      const validRoles = ['owner', 'admin', 'support'];
      if (!validRoles.includes(role)) {
        return { success: false, error: 'Invalid role. Must be: owner, admin, or support' };
      }

      const stmt = this.db.prepare(`
        INSERT INTO admins (user_id, role)
        VALUES (?, ?)
      `);
      
      stmt.run(userId, role);
      return { success: true, message: `Admin added with role: ${role}` };
    } catch (error) {
      if (error.code === 'SQLITE_CONSTRAINT') {
        return { success: false, error: 'User is already an admin' };
      }
      return { success: false, error: error.message };
    }
  }

  /**
   * Remove an admin
   * @param {number} userId - Telegram user ID
   * @returns {object} Result
   */
  removeAdmin(userId) {
    try {
      const stmt = this.db.prepare(`
        DELETE FROM admins WHERE user_id = ?
      `);
      
      const result = stmt.run(userId);
      
      if (result.changes === 0) {
        return { success: false, error: 'Admin not found' };
      }
      
      return { success: true, message: 'Admin removed successfully' };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Get all admins
   * @returns {array} List of admins
   */
  getAllAdmins() {
    try {
      const stmt = this.db.prepare(`
        SELECT user_id, role, created_at FROM admins ORDER BY created_at DESC
      `);
      
      return stmt.all();
    } catch (error) {
      console.error('Error fetching admins:', error);
      return [];
    }
  }

  /**
   * Check if user is an admin
   * @param {number} userId - Telegram user ID
   * @returns {object|null} Admin data or null
   */
  getAdmin(userId) {
    try {
      const stmt = this.db.prepare(`
        SELECT user_id, role, created_at FROM admins WHERE user_id = ?
      `);
      
      return stmt.get(userId);
    } catch (error) {
      console.error('Error checking admin:', error);
      return null;
    }
  }

  /**
   * Update admin role
   * @param {number} userId - Telegram user ID
   * @param {string} newRole - New role
   * @returns {object} Result
   */
  updateRole(userId, newRole) {
    try {
      const validRoles = ['owner', 'admin', 'support'];
      if (!validRoles.includes(newRole)) {
        return { success: false, error: 'Invalid role. Must be: owner, admin, or support' };
      }

      const stmt = this.db.prepare(`
        UPDATE admins SET role = ? WHERE user_id = ?
      `);
      
      const result = stmt.run(newRole, userId);
      
      if (result.changes === 0) {
        return { success: false, error: 'Admin not found' };
      }
      
      return { success: true, message: `Role updated to: ${newRole}` };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  /**
   * Check if user is authorized (admin or owner)
   * @param {number} userId - Telegram user ID
   * @param {number} ownerId - Owner ID from config
   * @returns {boolean} Is authorized
   */
  isAuthorized(userId, ownerId) {
    // Owner is always authorized
    if (userId === ownerId) {
      return true;
    }
    
    // Check if user is in admins table
    const admin = this.getAdmin(userId);
    return admin !== null;
  }

  /**
   * Check if user is owner
   * @param {number} userId - Telegram user ID
   * @param {number} ownerId - Owner ID from config
   * @returns {boolean} Is owner
   */
  isOwner(userId, ownerId) {
    return userId === ownerId;
  }
}

module.exports = new AdminService();

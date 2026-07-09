const Conversation = require('../models/Conversation');

/**
 * 🛡️ Group Authorization Middleware
 * Separate from main auth middleware for better organization
 */

class GroupAuth {
  /**
   * 🔍 Get Group from Params
   * Attaches group to request if it exists and is valid
   */
  static async getGroup(req, res, next) {
    try {
      const { groupId } = req.params;
      const userId = req.user?.id;

      if (!groupId) {
        return res.status(400).json({
          success: false,
          message: 'Group ID is required'
        });
      }

      // Find active group
      const group = await Conversation.findOne({
        _id: groupId,
        type: 'group',
        isArchived: false
      });

      if (!group) {
        return res.status(404).json({
          success: false,
          message: 'Group not found'
        });
      }

      // Attach group to request
      req.group = group;
      console.log(`📦 Group attached: ${group.name} (${group._id})`);
      next();
    } catch (err) {
      console.error('❌ Get group error:', err);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch group'
      });
    }
  }

  /**
   * 👑 Group Owner Only
   * Only the group owner can perform this action
   */
  static ownerOnly(req, res, next) {
    try {
      const group = req.group;
      const userId = req.user.id;

      const isOwner = group.participants.some(
        p => p.user.toString() === userId && 
             p.role === 'owner' && 
             p.isActive
      );

      if (!isOwner) {
        return res.status(403).json({
          success: false,
          message: 'Only group owner can perform this action'
        });
      }

      console.log(`👑 User ${userId} is group owner`);
      next();
    } catch (err) {
      console.error('❌ Owner check error:', err);
      res.status(500).json({
        success: false,
        message: 'Failed to verify ownership'
      });
    }
  }

  /**
   * 🛡️ Group Admin or Owner
   * Both admins and owners can perform this action
   */
  static adminOrOwner(req, res, next) {
    try {
      const group = req.group;
      const userId = req.user.id;

      const isAdminOrOwner = group.participants.some(
        p => p.user.toString() === userId && 
             p.isActive && 
             (p.role === 'admin' || p.role === 'owner')
      );

      if (!isAdminOrOwner) {
        return res.status(403).json({
          success: false,
          message: 'Only group admins or owner can perform this action'
        });
      }

      console.log(`🛡️ User ${userId} is admin/owner`);
      next();
    } catch (err) {
      console.error('❌ Admin/Owner check error:', err);
      res.status(500).json({
        success: false,
        message: 'Failed to verify admin privileges'
      });
    }
  }

  /**
   * 👥 Group Member Only
   * Must be an active member of the group
   */
  static memberOnly(req, res, next) {
    try {
      const group = req.group;
      const userId = req.user.id;

      const isMember = group.participants.some(
        p => p.user.toString() === userId && p.isActive
      );

      if (!isMember) {
        return res.status(403).json({
          success: false,
          message: 'You are not a member of this group'
        });
      }

      console.log(`👥 User ${userId} is group member`);
      next();
    } catch (err) {
      console.error('❌ Member check error:', err);
      res.status(500).json({
        success: false,
        message: 'Failed to verify membership'
      });
    }
  }

  /**
   * 🚫 Cannot Target Owner
   * Prevents targeting the group owner for certain actions
   */
  static cannotTargetOwner(req, res, next) {
    try {
      const group = req.group;
      const targetUserId = req.params.userId || req.body.userId;

      if (!targetUserId) {
        return next();
      }

      const isTargetOwner = group.participants.some(
        p => p.user.toString() === targetUserId.toString() && 
             p.role === 'owner' && 
             p.isActive
      );

      if (isTargetOwner) {
        return res.status(400).json({
          success: false,
          message: 'Cannot perform this action on group owner'
        });
      }

      next();
    } catch (err) {
      console.error('❌ Target owner check error:', err);
      res.status(500).json({
        success: false,
        message: 'Failed to verify target user'
      });
    }
  }

  /**
   * 📊 Check Group Size Limit
   * Ensures group doesn't exceed maximum participants
   */
  static checkGroupSize(req, res, next) {
    try {
      const group = req.group;
      
      if (group.participants.length >= group.settings.maxParticipants) {
        return res.status(400).json({
          success: false,
          message: `Group has reached maximum participants (${group.settings.maxParticipants})`
        });
      }

      next();
    } catch (err) {
      console.error('❌ Group size check error:', err);
      res.status(500).json({
        success: false,
        message: 'Failed to check group size'
      });
    }
  }

  /**
   * 🔐 Public Group Access
   * Allows access if group is public OR user is member
   */
  static publicOrMember(req, res, next) {
    try {
      const group = req.group;
      const userId = req.user?.id;

      // If group is public, allow access
      if (group.settings.isPublic) {
        return next();
      }

      // If user is authenticated and member, allow access
      if (userId) {
        const isMember = group.participants.some(
          p => p.user.toString() === userId && p.isActive
        );

        if (isMember) {
          return next();
        }
      }

      // Otherwise deny
      return res.status(403).json({
        success: false,
        message: 'This group is private. You must be a member to access it.'
      });
    } catch (err) {
      console.error('❌ Public/member check error:', err);
      res.status(500).json({
        success: false,
        message: 'Failed to verify access permissions'
      });
    }
  }

  /**
   * 📝 Can Send Messages
   * Checks if user can send messages (not muted, etc.)
   */
  static canSendMessages(req, res, next) {
    try {
      const group = req.group;
      const userId = req.user.id;

      const participant = group.participants.find(
        p => p.user.toString() === userId && p.isActive
      );

      if (!participant) {
        return res.status(403).json({
          success: false,
          message: 'You are not a member of this group'
        });
      }

      // Check if user is muted
      if (participant.notificationSettings?.mute) {
        const muteUntil = participant.notificationSettings.muteUntil;
        if (muteUntil && new Date() < muteUntil) {
          return res.status(403).json({
            success: false,
            message: 'You are muted from sending messages in this group'
          });
        }
      }

      // Check group settings
      if (!group.settings.allowMedia && req.body.attachment) {
        return res.status(403).json({
          success: false,
          message: 'Media attachments are not allowed in this group'
        });
      }

      next();
    } catch (err) {
      console.error('❌ Send message check error:', err);
      res.status(500).json({
        success: false,
        message: 'Failed to verify message permissions'
      });
    }
  }

  /**
   * 🔧 Can Modify Settings
   * Only owners and admins can modify group settings
   */
  static canModifySettings(req, res, next) {
    try {
      const group = req.group;
      const userId = req.user.id;

      const isAdminOrOwner = group.participants.some(
        p => p.user.toString() === userId && 
             p.isActive && 
             (p.role === 'admin' || p.role === 'owner')
      );

      if (!isAdminOrOwner) {
        return res.status(403).json({
          success: false,
          message: 'Only admins or owner can modify group settings'
        });
      }

      next();
    } catch (err) {
      console.error('❌ Modify settings check error:', err);
      res.status(500).json({
        success: false,
        message: 'Failed to verify settings permissions'
      });
    }
  }
}

module.exports = GroupAuth;
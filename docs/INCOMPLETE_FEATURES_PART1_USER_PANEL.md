# User Panel Implementation - Complete Documentation

**Document Version:** 1.0  
**Last Updated:** 2025-12-29  
**Status:** Implementation Guide

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Backend Implementation](#backend-implementation)
4. [Frontend Implementation](#frontend-implementation)
5. [Integration Guide](#integration-guide)
6. [Testing Strategy](#testing-strategy)
7. [Security Considerations](#security-considerations)
8. [Deployment Checklist](#deployment-checklist)

---

## Overview

### Purpose
The User Panel is a comprehensive dashboard that provides authenticated users with access to their profile management, settings, activity history, and personalized content within the ToInfinity application.

### Key Features
- User profile management
- Account settings and preferences
- Activity history and analytics
- Notification center
- Security settings (password change, 2FA)
- Data export and privacy controls

### Technology Stack
- **Backend:** Node.js/Express or Python/Django (adjust as needed)
- **Frontend:** React/Vue.js/Angular (adjust as needed)
- **Database:** PostgreSQL/MongoDB (adjust as needed)
- **Authentication:** JWT/OAuth2

---

## Architecture

### System Components

```
┌─────────────────────────────────────────────────────┐
│                   User Panel                         │
├─────────────────────────────────────────────────────┤
│                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────┐ │
│  │   Profile    │  │   Settings   │  │  Activity │ │
│  │  Management  │  │  & Prefs     │  │  History  │ │
│  └──────────────┘  └──────────────┘  └───────────┘ │
│                                                      │
│  ┌──────────────┐  ┌──────────────┐  ┌───────────┐ │
│  │Notifications │  │   Security   │  │  Privacy  │ │
│  │    Center    │  │   Settings   │  │  Controls │ │
│  └──────────────┘  └──────────────┘  └───────────┘ │
│                                                      │
└─────────────────────────────────────────────────────┘
         ↓                    ↓                   ↓
    [API Layer]         [Auth Service]     [Data Layer]
```

### Data Flow

1. **User Authentication** → JWT Token Generation
2. **Request Authorization** → Token Validation
3. **Data Retrieval** → Database Query
4. **Response Formatting** → JSON API Response
5. **UI Rendering** → Component Update

---

## Backend Implementation

### 1. Routes Configuration

#### User Profile Routes

```javascript
// routes/userPanel.js

const express = require('express');
const router = express.Router();
const authMiddleware = require('../middleware/auth');
const userPanelController = require('../controllers/userPanelController');
const { validateProfile, validateSettings } = require('../validators/userPanelValidator');

// Profile Management
router.get('/profile', authMiddleware, userPanelController.getProfile);
router.put('/profile', authMiddleware, validateProfile, userPanelController.updateProfile);
router.post('/profile/avatar', authMiddleware, userPanelController.uploadAvatar);
router.delete('/profile/avatar', authMiddleware, userPanelController.deleteAvatar);

// Account Settings
router.get('/settings', authMiddleware, userPanelController.getSettings);
router.put('/settings', authMiddleware, validateSettings, userPanelController.updateSettings);
router.put('/settings/email', authMiddleware, userPanelController.changeEmail);
router.put('/settings/password', authMiddleware, userPanelController.changePassword);

// Activity & History
router.get('/activity', authMiddleware, userPanelController.getActivity);
router.get('/activity/:id', authMiddleware, userPanelController.getActivityDetail);
router.delete('/activity/:id', authMiddleware, userPanelController.deleteActivity);

// Notifications
router.get('/notifications', authMiddleware, userPanelController.getNotifications);
router.put('/notifications/:id/read', authMiddleware, userPanelController.markNotificationRead);
router.put('/notifications/read-all', authMiddleware, userPanelController.markAllNotificationsRead);
router.delete('/notifications/:id', authMiddleware, userPanelController.deleteNotification);

// Security Settings
router.get('/security', authMiddleware, userPanelController.getSecuritySettings);
router.post('/security/2fa/enable', authMiddleware, userPanelController.enable2FA);
router.post('/security/2fa/disable', authMiddleware, userPanelController.disable2FA);
router.get('/security/sessions', authMiddleware, userPanelController.getActiveSessions);
router.delete('/security/sessions/:id', authMiddleware, userPanelController.terminateSession);

// Privacy & Data
router.get('/privacy', authMiddleware, userPanelController.getPrivacySettings);
router.put('/privacy', authMiddleware, userPanelController.updatePrivacySettings);
router.post('/data/export', authMiddleware, userPanelController.exportUserData);
router.delete('/account', authMiddleware, userPanelController.deleteAccount);

module.exports = router;
```

### 2. Controller Implementation

```javascript
// controllers/userPanelController.js

const UserService = require('../services/userService');
const NotificationService = require('../services/notificationService');
const ActivityService = require('../services/activityService');
const SecurityService = require('../services/securityService');

class UserPanelController {
  
  // Profile Management
  async getProfile(req, res) {
    try {
      const userId = req.user.id;
      const profile = await UserService.getProfileById(userId);
      
      res.status(200).json({
        success: true,
        data: profile
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve profile',
        error: error.message
      });
    }
  }

  async updateProfile(req, res) {
    try {
      const userId = req.user.id;
      const updates = req.body;
      
      const updatedProfile = await UserService.updateProfile(userId, updates);
      
      // Log activity
      await ActivityService.logActivity(userId, 'PROFILE_UPDATE', {
        changes: Object.keys(updates)
      });
      
      res.status(200).json({
        success: true,
        message: 'Profile updated successfully',
        data: updatedProfile
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to update profile',
        error: error.message
      });
    }
  }

  async uploadAvatar(req, res) {
    try {
      const userId = req.user.id;
      const file = req.file;
      
      if (!file) {
        return res.status(400).json({
          success: false,
          message: 'No file uploaded'
        });
      }
      
      const avatarUrl = await UserService.uploadAvatar(userId, file);
      
      res.status(200).json({
        success: true,
        message: 'Avatar uploaded successfully',
        data: { avatarUrl }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to upload avatar',
        error: error.message
      });
    }
  }

  // Settings Management
  async getSettings(req, res) {
    try {
      const userId = req.user.id;
      const settings = await UserService.getSettings(userId);
      
      res.status(200).json({
        success: true,
        data: settings
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve settings',
        error: error.message
      });
    }
  }

  async updateSettings(req, res) {
    try {
      const userId = req.user.id;
      const settings = req.body;
      
      const updatedSettings = await UserService.updateSettings(userId, settings);
      
      res.status(200).json({
        success: true,
        message: 'Settings updated successfully',
        data: updatedSettings
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to update settings',
        error: error.message
      });
    }
  }

  async changePassword(req, res) {
    try {
      const userId = req.user.id;
      const { currentPassword, newPassword } = req.body;
      
      await UserService.changePassword(userId, currentPassword, newPassword);
      
      // Log activity
      await ActivityService.logActivity(userId, 'PASSWORD_CHANGE');
      
      // Send notification
      await NotificationService.sendNotification(userId, {
        type: 'SECURITY',
        title: 'Password Changed',
        message: 'Your password has been changed successfully'
      });
      
      res.status(200).json({
        success: true,
        message: 'Password changed successfully'
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }

  // Activity & History
  async getActivity(req, res) {
    try {
      const userId = req.user.id;
      const { page = 1, limit = 20, type } = req.query;
      
      const activities = await ActivityService.getUserActivities(userId, {
        page: parseInt(page),
        limit: parseInt(limit),
        type
      });
      
      res.status(200).json({
        success: true,
        data: activities
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve activity history',
        error: error.message
      });
    }
  }

  // Notifications
  async getNotifications(req, res) {
    try {
      const userId = req.user.id;
      const { unreadOnly = false, page = 1, limit = 20 } = req.query;
      
      const notifications = await NotificationService.getNotifications(userId, {
        unreadOnly: unreadOnly === 'true',
        page: parseInt(page),
        limit: parseInt(limit)
      });
      
      res.status(200).json({
        success: true,
        data: notifications
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve notifications',
        error: error.message
      });
    }
  }

  async markNotificationRead(req, res) {
    try {
      const userId = req.user.id;
      const notificationId = req.params.id;
      
      await NotificationService.markAsRead(userId, notificationId);
      
      res.status(200).json({
        success: true,
        message: 'Notification marked as read'
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to mark notification as read',
        error: error.message
      });
    }
  }

  // Security Settings
  async getSecuritySettings(req, res) {
    try {
      const userId = req.user.id;
      const securitySettings = await SecurityService.getSettings(userId);
      
      res.status(200).json({
        success: true,
        data: securitySettings
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve security settings',
        error: error.message
      });
    }
  }

  async enable2FA(req, res) {
    try {
      const userId = req.user.id;
      const { method = 'totp' } = req.body;
      
      const result = await SecurityService.enable2FA(userId, method);
      
      res.status(200).json({
        success: true,
        message: '2FA enabled successfully',
        data: result
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to enable 2FA',
        error: error.message
      });
    }
  }

  async getActiveSessions(req, res) {
    try {
      const userId = req.user.id;
      const sessions = await SecurityService.getActiveSessions(userId);
      
      res.status(200).json({
        success: true,
        data: sessions
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to retrieve active sessions',
        error: error.message
      });
    }
  }

  // Privacy & Data Management
  async exportUserData(req, res) {
    try {
      const userId = req.user.id;
      
      // Queue export job
      const exportJob = await UserService.queueDataExport(userId);
      
      res.status(202).json({
        success: true,
        message: 'Data export queued. You will receive an email when ready.',
        data: { jobId: exportJob.id }
      });
    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Failed to queue data export',
        error: error.message
      });
    }
  }

  async deleteAccount(req, res) {
    try {
      const userId = req.user.id;
      const { password, confirmation } = req.body;
      
      if (confirmation !== 'DELETE MY ACCOUNT') {
        return res.status(400).json({
          success: false,
          message: 'Invalid confirmation text'
        });
      }
      
      await UserService.deleteAccount(userId, password);
      
      res.status(200).json({
        success: true,
        message: 'Account deletion initiated. Your data will be permanently deleted within 30 days.'
      });
    } catch (error) {
      res.status(400).json({
        success: false,
        message: error.message
      });
    }
  }
}

module.exports = new UserPanelController();
```

### 3. Service Layer Implementation

```javascript
// services/userService.js

const User = require('../models/User');
const bcrypt = require('bcrypt');
const { uploadToS3, deleteFromS3 } = require('../utils/s3');

class UserService {
  
  async getProfileById(userId) {
    const user = await User.findById(userId)
      .select('-password -__v')
      .lean();
    
    if (!user) {
      throw new Error('User not found');
    }
    
    return user;
  }

  async updateProfile(userId, updates) {
    const allowedUpdates = [
      'firstName',
      'lastName',
      'displayName',
      'bio',
      'location',
      'website',
      'socialLinks'
    ];
    
    const filteredUpdates = {};
    Object.keys(updates).forEach(key => {
      if (allowedUpdates.includes(key)) {
        filteredUpdates[key] = updates[key];
      }
    });
    
    const user = await User.findByIdAndUpdate(
      userId,
      { $set: filteredUpdates },
      { new: true, runValidators: true }
    ).select('-password');
    
    return user;
  }

  async uploadAvatar(userId, file) {
    // Upload to S3 or storage service
    const avatarUrl = await uploadToS3(file, `avatars/${userId}`);
    
    // Update user record
    await User.findByIdAndUpdate(userId, {
      $set: { avatarUrl }
    });
    
    return avatarUrl;
  }

  async getSettings(userId) {
    const user = await User.findById(userId)
      .select('settings preferences notifications')
      .lean();
    
    return {
      settings: user.settings || {},
      preferences: user.preferences || {},
      notifications: user.notifications || {}
    };
  }

  async updateSettings(userId, settings) {
    const user = await User.findByIdAndUpdate(
      userId,
      { $set: { settings } },
      { new: true }
    ).select('settings');
    
    return user.settings;
  }

  async changePassword(userId, currentPassword, newPassword) {
    const user = await User.findById(userId);
    
    if (!user) {
      throw new Error('User not found');
    }
    
    // Verify current password
    const isValid = await bcrypt.compare(currentPassword, user.password);
    if (!isValid) {
      throw new Error('Current password is incorrect');
    }
    
    // Hash and update new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    user.password = hashedPassword;
    user.passwordChangedAt = new Date();
    await user.save();
    
    return true;
  }

  async queueDataExport(userId) {
    // Queue export job (using Bull, RabbitMQ, or similar)
    const job = {
      id: `export_${userId}_${Date.now()}`,
      userId,
      status: 'queued',
      createdAt: new Date()
    };
    
    // Add to job queue
    // await exportQueue.add(job);
    
    return job;
  }

  async deleteAccount(userId, password) {
    const user = await User.findById(userId);
    
    if (!user) {
      throw new Error('User not found');
    }
    
    // Verify password
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      throw new Error('Invalid password');
    }
    
    // Mark for deletion
    user.deletionScheduledAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000); // 30 days
    user.status = 'pending_deletion';
    await user.save();
    
    return true;
  }
}

module.exports = new UserService();
```

```javascript
// services/activityService.js

const Activity = require('../models/Activity');

class ActivityService {
  
  async logActivity(userId, type, metadata = {}) {
    const activity = await Activity.create({
      userId,
      type,
      metadata,
      timestamp: new Date(),
      ipAddress: metadata.ipAddress,
      userAgent: metadata.userAgent
    });
    
    return activity;
  }

  async getUserActivities(userId, options = {}) {
    const { page = 1, limit = 20, type } = options;
    const skip = (page - 1) * limit;
    
    const query = { userId };
    if (type) {
      query.type = type;
    }
    
    const [activities, total] = await Promise.all([
      Activity.find(query)
        .sort({ timestamp: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Activity.countDocuments(query)
    ]);
    
    return {
      activities,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }

  async deleteActivity(userId, activityId) {
    await Activity.deleteOne({ _id: activityId, userId });
    return true;
  }
}

module.exports = new ActivityService();
```

```javascript
// services/notificationService.js

const Notification = require('../models/Notification');

class NotificationService {
  
  async sendNotification(userId, notification) {
    const newNotification = await Notification.create({
      userId,
      ...notification,
      createdAt: new Date(),
      read: false
    });
    
    // Emit real-time notification via WebSocket
    // socketService.emitToUser(userId, 'notification', newNotification);
    
    return newNotification;
  }

  async getNotifications(userId, options = {}) {
    const { unreadOnly = false, page = 1, limit = 20 } = options;
    const skip = (page - 1) * limit;
    
    const query = { userId };
    if (unreadOnly) {
      query.read = false;
    }
    
    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Notification.countDocuments(query),
      Notification.countDocuments({ userId, read: false })
    ]);
    
    return {
      notifications,
      unreadCount,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit)
      }
    };
  }

  async markAsRead(userId, notificationId) {
    await Notification.updateOne(
      { _id: notificationId, userId },
      { $set: { read: true, readAt: new Date() } }
    );
    return true;
  }

  async markAllAsRead(userId) {
    await Notification.updateMany(
      { userId, read: false },
      { $set: { read: true, readAt: new Date() } }
    );
    return true;
  }
}

module.exports = new NotificationService();
```

### 4. Database Models

```javascript
// models/User.js

const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    required: true,
    unique: true,
    lowercase: true,
    trim: true
  },
  password: {
    type: String,
    required: true
  },
  firstName: String,
  lastName: String,
  displayName: String,
  avatarUrl: String,
  bio: String,
  location: String,
  website: String,
  socialLinks: {
    twitter: String,
    linkedin: String,
    github: String
  },
  settings: {
    language: { type: String, default: 'en' },
    timezone: { type: String, default: 'UTC' },
    theme: { type: String, enum: ['light', 'dark', 'auto'], default: 'auto' }
  },
  preferences: {
    emailNotifications: { type: Boolean, default: true },
    pushNotifications: { type: Boolean, default: true },
    newsletter: { type: Boolean, default: false }
  },
  security: {
    twoFactorEnabled: { type: Boolean, default: false },
    twoFactorSecret: String,
    backupCodes: [String]
  },
  status: {
    type: String,
    enum: ['active', 'inactive', 'suspended', 'pending_deletion'],
    default: 'active'
  },
  deletionScheduledAt: Date,
  passwordChangedAt: Date,
  lastLoginAt: Date,
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});

userSchema.index({ email: 1 });
userSchema.index({ status: 1 });

module.exports = mongoose.model('User', userSchema);
```

```javascript
// models/Activity.js

const mongoose = require('mongoose');

const activitySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  type: {
    type: String,
    required: true,
    enum: [
      'LOGIN',
      'LOGOUT',
      'PROFILE_UPDATE',
      'PASSWORD_CHANGE',
      'EMAIL_CHANGE',
      'SETTINGS_UPDATE',
      '2FA_ENABLED',
      '2FA_DISABLED',
      'DATA_EXPORT',
      'ACCOUNT_DELETION'
    ]
  },
  metadata: mongoose.Schema.Types.Mixed,
  ipAddress: String,
  userAgent: String,
  timestamp: { type: Date, default: Date.now, index: true }
});

activitySchema.index({ userId: 1, timestamp: -1 });

module.exports = mongoose.model('Activity', activitySchema);
```

```javascript
// models/Notification.js

const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true
  },
  type: {
    type: String,
    required: true,
    enum: ['INFO', 'SUCCESS', 'WARNING', 'ERROR', 'SECURITY']
  },
  title: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  read: {
    type: Boolean,
    default: false,
    index: true
  },
  readAt: Date,
  actionUrl: String,
  createdAt: { type: Date, default: Date.now, index: true }
});

notificationSchema.index({ userId: 1, read: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
```

---

## Frontend Implementation

### 1. Component Structure

```
src/
├── components/
│   └── UserPanel/
│       ├── Dashboard/
│       │   ├── DashboardOverview.jsx
│       │   └── QuickActions.jsx
│       ├── Profile/
│       │   ├── ProfileView.jsx
│       │   ├── ProfileEdit.jsx
│       │   ├── AvatarUpload.jsx
│       │   └── SocialLinks.jsx
│       ├── Settings/
│       │   ├── GeneralSettings.jsx
│       │   ├── NotificationSettings.jsx
│       │   ├── PreferencesSettings.jsx
│       │   └── PasswordChange.jsx
│       ├── Activity/
│       │   ├── ActivityList.jsx
│       │   ├── ActivityItem.jsx
│       │   └── ActivityFilters.jsx
│       ├── Notifications/
│       │   ├── NotificationCenter.jsx
│       │   ├── NotificationList.jsx
│       │   └── NotificationItem.jsx
│       ├── Security/
│       │   ├── SecuritySettings.jsx
│       │   ├── TwoFactorAuth.jsx
│       │   ├── ActiveSessions.jsx
│       │   └── SessionItem.jsx
│       └── Privacy/
│           ├── PrivacySettings.jsx
│           ├── DataExport.jsx
│           └── AccountDeletion.jsx
```

### 2. React Component Examples

```jsx
// components/UserPanel/Profile/ProfileView.jsx

import React, { useState, useEffect } from 'react';
import { useAuth } from '../../../hooks/useAuth';
import { userPanelService } from '../../../services/userPanelService';
import AvatarUpload from './AvatarUpload';
import './ProfileView.css';

const ProfileView = () => {
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchProfile();
  }, []);

  const fetchProfile = async () => {
    try {
      setLoading(true);
      const data = await userPanelService.getProfile();
      setProfile(data);
    } catch (err) {
      setError('Failed to load profile');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleUpdateProfile = async (updates) => {
    try {
      const updated = await userPanelService.updateProfile(updates);
      setProfile(updated);
      setIsEditing(false);
    } catch (err) {
      setError('Failed to update profile');
      console.error(err);
    }
  };

  if (loading) return <div className="loading">Loading profile...</div>;
  if (error) return <div className="error">{error}</div>;
  if (!profile) return null;

  return (
    <div className="profile-view">
      <div className="profile-header">
        <AvatarUpload
          currentAvatar={profile.avatarUrl}
          onUpload={fetchProfile}
        />
        <div className="profile-info">
          <h1>{profile.displayName || `${profile.firstName} ${profile.lastName}`}</h1>
          <p className="email">{profile.email}</p>
          {profile.bio && <p className="bio">{profile.bio}</p>}
        </div>
        <button 
          className="btn-edit"
          onClick={() => setIsEditing(true)}
        >
          Edit Profile
        </button>
      </div>

      <div className="profile-details">
        <div className="detail-group">
          <h3>Personal Information</h3>
          <div className="detail-item">
            <span className="label">Name:</span>
            <span className="value">
              {profile.firstName} {profile.lastName}
            </span>
          </div>
          {profile.location && (
            <div className="detail-item">
              <span className="label">Location:</span>
              <span className="value">{profile.location}</span>
            </div>
          )}
          {profile.website && (
            <div className="detail-item">
              <span className="label">Website:</span>
              <a href={profile.website} target="_blank" rel="noopener noreferrer">
                {profile.website}
              </a>
            </div>
          )}
        </div>

        {profile.socialLinks && Object.keys(profile.socialLinks).length > 0 && (
          <div className="detail-group">
            <h3>Social Links</h3>
            {Object.entries(profile.socialLinks).map(([platform, url]) => (
              url && (
                <div key={platform} className="detail-item">
                  <span className="label">{platform}:</span>
                  <a href={url} target="_blank" rel="noopener noreferrer">
                    {url}
                  </a>
                </div>
              )
            ))}
          </div>
        )}
      </div>

      {isEditing && (
        <ProfileEditModal
          profile={profile}
          onSave={handleUpdateProfile}
          onCancel={() => setIsEditing(false)}
        />
      )}
    </div>
  );
};

export default ProfileView;
```

```jsx
// components/UserPanel/Settings/GeneralSettings.jsx

import React, { useState, useEffect } from 'react';
import { userPanelService } from '../../../services/userPanelService';
import './GeneralSettings.css';

const GeneralSettings = () => {
  const [settings, setSettings] = useState({
    language: 'en',
    timezone: 'UTC',
    theme: 'auto'
  });
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const data = await userPanelService.getSettings();
      setSettings(data.settings);
    } catch (err) {
      console.error('Failed to load settings:', err);
    }
  };

  const handleChange = (field, value) => {
    setSettings(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await userPanelService.updateSettings(settings);
      setMessage({ type: 'success', text: 'Settings saved successfully' });
      setTimeout(() => setMessage(null), 3000);
    } catch (err) {
      setMessage({ type: 'error', text: 'Failed to save settings' });
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="general-settings">
      <h2>General Settings</h2>

      {message && (
        <div className={`message ${message.type}`}>
          {message.text}
        </div>
      )}

      <div className="settings-form">
        <div className="form-group">
          <label htmlFor="language">Language</label>
          <select
            id="language"
            value={settings.language}
            onChange={(e) => handleChange('language', e.target.value)}
          >
            <option value="en">English</option>
            <option value="es">Español</option>
            <option value="fr">Français</option>
            <option value="de">Deutsch</option>
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="timezone">Timezone</label>
          <select
            id="timezone"
            value={settings.timezone}
            onChange={(e) => handleChange('timezone', e.target.value)}
          >
            <option value="UTC">UTC</option>
            <option value="America/New_York">Eastern Time</option>
            <option value="America/Chicago">Central Time</option>
            <option value="America/Denver">Mountain Time</option>
            <option value="America/Los_Angeles">Pacific Time</option>
            <option value="Europe/London">London</option>
            <option value="Europe/Paris">Paris</option>
            <option value="Asia/Tokyo">Tokyo</option>
          </select>
        </div>

        <div className="form-group">
          <label htmlFor="theme">Theme</label>
          <select
            id="theme"
            value={settings.theme}
            onChange={(e) => handleChange('theme', e.target.value)}
          >
            <option value="auto">Auto (System)</option>
            <option value="light">Light</option>
            <option value="dark">Dark</option>
          </select>
        </div>

        <button
          className="btn-save"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>
    </div>
  );
};

export default GeneralSettings;
```

```jsx
// components/UserPanel/Activity/ActivityList.jsx

import React, { useState, useEffect } from 'react';
import { userPanelService } from '../../../services/userPanelService';
import ActivityItem from './ActivityItem';
import ActivityFilters from './ActivityFilters';
import './ActivityList.css';

const ActivityList = () => {
  const [activities, setActivities] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({
    type: null,
    page: 1,
    limit: 20
  });
  const [pagination, setPagination] = useState(null);

  useEffect(() => {
    fetchActivities();
  }, [filters]);

  const fetchActivities = async () => {
    try {
      setLoading(true);
      const data = await userPanelService.getActivity(filters);
      setActivities(data.activities);
      setPagination(data.pagination);
    } catch (err) {
      console.error('Failed to load activities:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (newFilters) => {
    setFilters(prev => ({
      ...prev,
      ...newFilters,
      page: 1 // Reset to first page on filter change
    }));
  };

  const handlePageChange = (newPage) => {
    setFilters(prev => ({
      ...prev,
      page: newPage
    }));
  };

  return (
    <div className="activity-list">
      <h2>Activity History</h2>
      
      <ActivityFilters
        currentFilters={filters}
        onFilterChange={handleFilterChange}
      />

      {loading ? (
        <div className="loading">Loading activities...</div>
      ) : activities.length === 0 ? (
        <div className="empty-state">No activities found</div>
      ) : (
        <>
          <div className="activities">
            {activities.map(activity => (
              <ActivityItem
                key={activity._id}
                activity={activity}
              />
            ))}
          </div>

          {pagination && pagination.pages > 1 && (
            <div className="pagination">
              <button
                disabled={pagination.page === 1}
                onClick={() => handlePageChange(pagination.page - 1)}
              >
                Previous
              </button>
              <span>
                Page {pagination.page} of {pagination.pages}
              </span>
              <button
                disabled={pagination.page === pagination.pages}
                onClick={() => handlePageChange(pagination.page + 1)}
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
};

export default ActivityList;
```

### 3. API Service Layer

```javascript
// services/userPanelService.js

import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:3000/api';

class UserPanelService {
  constructor() {
    this.client = axios.create({
      baseURL: `${API_BASE_URL}/user-panel`,
      headers: {
        'Content-Type': 'application/json'
      }
    });

    // Add token to requests
    this.client.interceptors.request.use(
      (config) => {
        const token = localStorage.getItem('authToken');
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error) => Promise.reject(error)
    );
  }

  // Profile
  async getProfile() {
    const response = await this.client.get('/profile');
    return response.data.data;
  }

  async updateProfile(updates) {
    const response = await this.client.put('/profile', updates);
    return response.data.data;
  }

  async uploadAvatar(file) {
    const formData = new FormData();
    formData.append('avatar', file);
    
    const response = await this.client.post('/profile/avatar', formData, {
      headers: {
        'Content-Type': 'multipart/form-data'
      }
    });
    return response.data.data;
  }

  // Settings
  async getSettings() {
    const response = await this.client.get('/settings');
    return response.data.data;
  }

  async updateSettings(settings) {
    const response = await this.client.put('/settings', settings);
    return response.data.data;
  }

  async changePassword(currentPassword, newPassword) {
    const response = await this.client.put('/settings/password', {
      currentPassword,
      newPassword
    });
    return response.data;
  }

  // Activity
  async getActivity(filters = {}) {
    const response = await this.client.get('/activity', { params: filters });
    return response.data.data;
  }

  // Notifications
  async getNotifications(params = {}) {
    const response = await this.client.get('/notifications', { params });
    return response.data.data;
  }

  async markNotificationRead(notificationId) {
    const response = await this.client.put(`/notifications/${notificationId}/read`);
    return response.data;
  }

  async markAllNotificationsRead() {
    const response = await this.client.put('/notifications/read-all');
    return response.data;
  }

  // Security
  async getSecuritySettings() {
    const response = await this.client.get('/security');
    return response.data.data;
  }

  async enable2FA(method = 'totp') {
    const response = await this.client.post('/security/2fa/enable', { method });
    return response.data.data;
  }

  async disable2FA(code) {
    const response = await this.client.post('/security/2fa/disable', { code });
    return response.data;
  }

  async getActiveSessions() {
    const response = await this.client.get('/security/sessions');
    return response.data.data;
  }

  async terminateSession(sessionId) {
    const response = await this.client.delete(`/security/sessions/${sessionId}`);
    return response.data;
  }

  // Privacy
  async getPrivacySettings() {
    const response = await this.client.get('/privacy');
    return response.data.data;
  }

  async updatePrivacySettings(settings) {
    const response = await this.client.put('/privacy', settings);
    return response.data.data;
  }

  async requestDataExport() {
    const response = await this.client.post('/data/export');
    return response.data;
  }

  async deleteAccount(password, confirmation) {
    const response = await this.client.delete('/account', {
      data: { password, confirmation }
    });
    return response.data;
  }
}

export const userPanelService = new UserPanelService();
```

---

## Integration Guide

### Step 1: Install Dependencies

```bash
# Backend dependencies
npm install express mongoose bcrypt jsonwebtoken multer aws-sdk

# Frontend dependencies
npm install axios react-router-dom
```

### Step 2: Configure Environment Variables

```env
# .env file

# Database
MONGODB_URI=mongodb://localhost:27017/toinfinity
DB_NAME=toinfinity

# JWT
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_EXPIRATION=7d

# AWS S3 (for avatar uploads)
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
AWS_REGION=us-east-1
AWS_S3_BUCKET=toinfinity-avatars

# Email
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password

# App
PORT=3000
NODE_ENV=development
FRONTEND_URL=http://localhost:3001
```

### Step 3: Register Routes

```javascript
// app.js or server.js

const express = require('express');
const userPanelRoutes = require('./routes/userPanel');

const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/api/user-panel', userPanelRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    success: false,
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
```

### Step 4: Add Frontend Routes

```jsx
// App.jsx

import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import UserPanelLayout from './layouts/UserPanelLayout';
import ProfileView from './components/UserPanel/Profile/ProfileView';
import GeneralSettings from './components/UserPanel/Settings/GeneralSettings';
import ActivityList from './components/UserPanel/Activity/ActivityList';
import NotificationCenter from './components/UserPanel/Notifications/NotificationCenter';
import SecuritySettings from './components/UserPanel/Security/SecuritySettings';
import PrivacySettings from './components/UserPanel/Privacy/PrivacySettings';
import ProtectedRoute from './components/Auth/ProtectedRoute';

function App() {
  return (
    <Router>
      <Routes>
        <Route path="/user-panel" element={
          <ProtectedRoute>
            <UserPanelLayout />
          </ProtectedRoute>
        }>
          <Route index element={<ProfileView />} />
          <Route path="profile" element={<ProfileView />} />
          <Route path="settings" element={<GeneralSettings />} />
          <Route path="activity" element={<ActivityList />} />
          <Route path="notifications" element={<NotificationCenter />} />
          <Route path="security" element={<SecuritySettings />} />
          <Route path="privacy" element={<PrivacySettings />} />
        </Route>
      </Routes>
    </Router>
  );
}

export default App;
```

### Step 5: Create Middleware

```javascript
// middleware/auth.js

const jwt = require('jsonwebtoken');
const User = require('../models/User');

const authMiddleware = async (req, res, next) => {
  try {
    // Get token from header
    const authHeader = req.headers.authorization;
    
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'No token provided'
      });
    }

    const token = authHeader.substring(7);

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Get user from database
    const user = await User.findById(decoded.userId).select('-password');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'User not found'
      });
    }

    if (user.status !== 'active') {
      return res.status(403).json({
        success: false,
        message: 'Account is not active'
      });
    }

    // Attach user to request
    req.user = user;
    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: 'Invalid or expired token',
      error: error.message
    });
  }
};

module.exports = authMiddleware;
```

---

## Testing Strategy

### Unit Tests

```javascript
// tests/services/userService.test.js

const { expect } = require('chai');
const sinon = require('sinon');
const UserService = require('../../services/userService');
const User = require('../../models/User');

describe('UserService', () => {
  afterEach(() => {
    sinon.restore();
  });

  describe('getProfileById', () => {
    it('should return user profile without password', async () => {
      const mockUser = {
        _id: '123',
        email: 'test@example.com',
        firstName: 'John',
        lastName: 'Doe'
      };

      sinon.stub(User, 'findById').returns({
        select: sinon.stub().returns({
          lean: sinon.stub().resolves(mockUser)
        })
      });

      const profile = await UserService.getProfileById('123');
      
      expect(profile).to.deep.equal(mockUser);
      expect(profile).to.not.have.property('password');
    });

    it('should throw error if user not found', async () => {
      sinon.stub(User, 'findById').returns({
        select: sinon.stub().returns({
          lean: sinon.stub().resolves(null)
        })
      });

      try {
        await UserService.getProfileById('invalid-id');
        expect.fail('Should have thrown an error');
      } catch (error) {
        expect(error.message).to.equal('User not found');
      }
    });
  });

  describe('updateProfile', () => {
    it('should update only allowed fields', async () => {
      const updates = {
        firstName: 'Jane',
        password: 'should-not-update', // Should be filtered out
        isAdmin: true // Should be filtered out
      };

      const mockUpdated = {
        _id: '123',
        firstName: 'Jane',
        lastName: 'Doe'
      };

      sinon.stub(User, 'findByIdAndUpdate').returns({
        select: sinon.stub().resolves(mockUpdated)
      });

      const result = await UserService.updateProfile('123', updates);
      
      expect(result.firstName).to.equal('Jane');
      expect(result).to.not.have.property('password');
      expect(result).to.not.have.property('isAdmin');
    });
  });
});
```

### Integration Tests

```javascript
// tests/integration/userPanel.test.js

const request = require('supertest');
const app = require('../../app');
const User = require('../../models/User');
const { generateToken } = require('../../utils/auth');

describe('User Panel API', () => {
  let authToken;
  let userId;

  before(async () => {
    // Create test user
    const user = await User.create({
      email: 'test@example.com',
      password: 'hashedpassword',
      firstName: 'Test',
      lastName: 'User'
    });
    
    userId = user._id;
    authToken = generateToken(user._id);
  });

  after(async () => {
    // Cleanup
    await User.deleteMany({});
  });

  describe('GET /api/user-panel/profile', () => {
    it('should return user profile', async () => {
      const res = await request(app)
        .get('/api/user-panel/profile')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).to.equal(200);
      expect(res.body.success).to.be.true;
      expect(res.body.data).to.have.property('email', 'test@example.com');
      expect(res.body.data).to.not.have.property('password');
    });

    it('should return 401 without token', async () => {
      const res = await request(app)
        .get('/api/user-panel/profile');

      expect(res.status).to.equal(401);
    });
  });

  describe('PUT /api/user-panel/profile', () => {
    it('should update profile successfully', async () => {
      const updates = {
        firstName: 'Updated',
        bio: 'New bio'
      };

      const res = await request(app)
        .put('/api/user-panel/profile')
        .set('Authorization', `Bearer ${authToken}`)
        .send(updates);

      expect(res.status).to.equal(200);
      expect(res.body.success).to.be.true;
      expect(res.body.data.firstName).to.equal('Updated');
      expect(res.body.data.bio).to.equal('New bio');
    });
  });
});
```

---

## Security Considerations

### 1. Authentication & Authorization
- ✅ JWT token-based authentication
- ✅ Token expiration and refresh mechanism
- ✅ Role-based access control (if needed)
- ✅ Session management

### 2. Data Protection
- ✅ Password hashing with bcrypt (10+ rounds)
- ✅ Secure password reset flow
- ✅ 2FA implementation
- ✅ Input validation and sanitization

### 3. API Security
- ✅ Rate limiting
- ✅ CORS configuration
- ✅ CSRF protection
- ✅ SQL injection prevention
- ✅ XSS protection

### 4. File Upload Security
- ✅ File type validation
- ✅ File size limits
- ✅ Virus scanning (optional)
- ✅ Secure file storage (S3 with signed URLs)

### 5. Privacy Compliance
- ✅ GDPR compliance (data export, deletion)
- ✅ Privacy policy acceptance
- ✅ User consent management
- ✅ Data retention policies

---

## Deployment Checklist

### Pre-Deployment
- [ ] Run all tests (unit, integration, e2e)
- [ ] Update environment variables for production
- [ ] Review security configurations
- [ ] Optimize database queries (add indexes)
- [ ] Set up monitoring and logging
- [ ] Configure backup strategy

### Database
- [ ] Run migrations
- [ ] Create indexes
- [ ] Set up database backups
- [ ] Configure connection pooling

### Backend
- [ ] Build production bundle
- [ ] Configure process manager (PM2, systemd)
- [ ] Set up reverse proxy (nginx)
- [ ] Enable HTTPS
- [ ] Configure rate limiting
- [ ] Set up error tracking (Sentry)

### Frontend
- [ ] Build production bundle
- [ ] Optimize assets (minify, compress)
- [ ] Configure CDN
- [ ] Set up analytics
- [ ] Test on multiple devices/browsers

### Post-Deployment
- [ ] Smoke tests
- [ ] Monitor error rates
- [ ] Check performance metrics
- [ ] Verify email notifications
- [ ] Test critical user flows

---

## Troubleshooting

### Common Issues

**Issue:** Token expiration errors
**Solution:** Implement token refresh mechanism or increase expiration time

**Issue:** File upload fails
**Solution:** Check file size limits, S3 permissions, and CORS configuration

**Issue:** Password change not working
**Solution:** Verify bcrypt comparison and ensure password validation rules match

**Issue:** Notifications not appearing
**Solution:** Check WebSocket connection and notification service configuration

**Issue:** Activity log not recording
**Solution:** Verify middleware is properly attached to routes

---

## Future Enhancements

1. **Social Authentication**
   - OAuth integration (Google, Facebook, GitHub)
   - Social profile linking

2. **Advanced Analytics**
   - User behavior tracking
   - Dashboard analytics
   - Export reports

3. **Enhanced Security**
   - Biometric authentication
   - Hardware key support (WebAuthn)
   - Advanced fraud detection

4. **Personalization**
   - AI-powered recommendations
   - Custom themes
   - Dashboard widgets

5. **Communication**
   - In-app messaging
   - Video calls
   - Team collaboration features

---

## Support & Resources

- **Documentation:** [Link to full docs]
- **API Reference:** [Link to API docs]
- **Issue Tracker:** [Link to GitHub issues]
- **Community Forum:** [Link to forum]
- **Contact:** support@toinfinity.com

---

**Document End**

*This documentation is maintained by the ToInfinity development team. For updates or corrections, please submit a pull request or contact the maintainers.*

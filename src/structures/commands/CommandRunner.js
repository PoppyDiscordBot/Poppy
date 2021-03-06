const { dev } = require('../../../config')
const i18next = require('i18next')
const PermissionsTools = require('../../utils/Permissions')
const CommandContext = require('./CommandContext')
const PermissionsList = require('../../utils/PermissionsList')
const CheckNicknameUtils = require('../../utils/CheckNicknameUtils')
const Emoji = require('../emojis/Emojis')

module.exports = class CommandRunner {
  constructor(client, msg) {
    this.client = client
    this.msg = msg
  }

  async load() {
    if (this.msg.channel.type !== 0) return
    if (this.msg.author.bot) return

    const guildData = await this.client.database.guilds.getOrCreate(this.msg.guildID)
    const userData = await this.client.database.users.getOrCreate(this.msg.author.id)
    if (guildData.blacklist.banned) return this.client.leaveGuild(this.msg.guildID)
    if (!guildData.prefix) {
      guildData.prefix = process.env.PREFIX
      guildData.save()
    }

    let locale
    const setFixedT = function (translate) {
      locale = translate
    }

    const language = (guildData && guildData.lang) || 'en-US'
    setFixedT(i18next.getFixedT(language))

    if (this.msg.content.replace('!', '') === `<@${this.client.user.id}>`) {
      return this.msg.channel.createMessage(`${Emoji.get('poppy_proud').mention} **|** ${this.msg.author.mention} ${locale('basic:onMention', { 0: guildData.prefix, 1: process.env.GLOBAL_PREFIX })}`)
    }

    const regexp = new RegExp(`^(${guildData.prefix?.replace(/[-[\]{}()*+?.,\\{ $|#\a]/g, '\\$&')}|${process.env.GLOBAL_PREFIX}|<@!?${this.client.user.id}>( )*)`, 'gi')
    if (!this.msg.content.match(regexp)) return
    const args = this.msg.content.replace(regexp, '').trim().split(/ +/g)
    const commandName = args.shift().toLowerCase()
    const command = this.client.commands.get(commandName) || this.client.commands.get(this.client.aliases.get(commandName))
    if (!command) return

    const ctx = new CommandContext(this.client, this.msg, args, locale, { user: userData, guild: guildData, global: this.client.database })
    if (command.config.developer && !dev.includes(this.msg.author.id)) return
    this.msg.channel.sendTyping()

    const check_nickname = CheckNicknameUtils.check(this.client, this.msg.channel.guild)
    if (check_nickname) {
      return this.msg.channel.createMessage(`${Emoji.get('poppy_pout').mention} **|** ${this.msg.author.mention} ${locale('basic:badNickname')}`)
    }

    if (this.client.commandCooldown.users.get(this.msg.author.id) === undefined) {
      this.client.commandCooldown.addUser(this.msg.author.id, command.config.cooldown * 1000)
    } else {
      return ctx.replyT('poppy_rip', 'basic:cooldown', {
        data: { 0: new Date(new Date(this.client.commandCooldown.users.get(this.msg.author.id).timeSet - Date.now())).getSeconds() }
      })

    }

    for (let permission of command.config.permissions.user) {
      let permissionSelect = PermissionsList[permission]
      if (typeof permissionSelect === 'object') {
        let permissionCheck = new PermissionsTools(ctx.msg.member.permissions)
        let positionPermision = permissionCheck.permissionsAllow.indexOf(permissionSelect.tag)
        if (permissionCheck.permissionsAllow[positionPermision] === undefined) {
          ctx.replyT('poppy_rip', 'basic:permissions.user', { data: { 0: permissionSelect.tag } })
          return
        }
      } else {
        ctx.replyT('poppy_rip', 'basic:permissions.unknown')
        return
      }
    }

    if (command.config.permissions.bot.size >= 0) {

    } else {
      const getBot = this.msg.channel.guild.members.get(ctx.client.user.id)
      for (let permission of command.config.permissions.bot) {
        let permissionSelect = PermissionsList[permission]
        if (typeof permissionSelect === 'object') {
          let permissionCheck = new PermissionsTools(getBot.permissions)
          let positionPermision = permissionCheck.permissionsAllow.indexOf(permissionSelect.tag)
          if (permissionCheck.permissionsAllow[positionPermision] === undefined) {
            ctx.replyT('poppy_rip', 'basic:permissions.bot', { data: { 0: permissionSelect.tag } })
            return
          }
        } else {
          ctx.replyT('poppy_rip', 'basic:permissions.unknown')
          return
        }
      }
    }

    command.run(ctx)
  }
}
